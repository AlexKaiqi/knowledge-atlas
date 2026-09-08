import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { root } from "./lib.mjs";
import { createApi } from "../server/api.mjs";
import { openLocalDatabase } from "../server/local-db.mjs";
import { codexCapability } from "../server/codex-cli.mjs";
import { startCodexRunner } from "../server/codex-runner.mjs";
import { createBrowserWorkbench } from "../server/browser-workbench.mjs";
import { acquireServiceLock } from "../server/local-service-lock.mjs";
import { attachBrowserProxy } from "../server/browser-proxy.mjs";
import {
  dockerCapability,
  startDockerRunner,
} from "../server/docker-runner.mjs";
const port = Number(process.env.PORT || 8080),
  dist = path.join(root, "dist/client");
const serviceLock = acquireServiceLock(process.env.ATLAS_DB_PATH || path.join(root, ".data/atlas.sqlite"));
const databasePath = serviceLock.databasePath;
const db = openLocalDatabase(
  databasePath,
  path.join(root, "drizzle"),
);
const catalog = JSON.parse(
  await fs.readFile(path.join(root, ".generated/catalog.json"), "utf8"),
);
const docker = dockerCapability();
let stopRunner = async () => {};
const agent = codexCapability();
const workbench = createBrowserWorkbench({ directory: path.join(root, ".local/workspaces"), databasePath });
const guidance = await fs.readFile(path.join(root, ".agents/skills/knowledge-atlas/references/conversation.md"), "utf8");
let stopCodex = async () => {};
const handle = createApi({ catalog, docker: !!docker, agent, workbench });
const requests = new Set();
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};
const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host;
    if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(host)) {
      res.writeHead(400);
      res.end("Invalid host");
      return;
    }
    const url = new URL(req.url, `http://${host}`);
    if (url.pathname.startsWith("/api/")) {
      const abort = new AbortController();
      requests.add(abort);
      res.once("close", () => { abort.abort(); requests.delete(abort); });
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 48000) {
          res.writeHead(413, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "内容太长，请缩短后重试。" }));
          return;
        }
        chunks.push(chunk);
      }
      const request = new Request(url, {
        signal: abort.signal,
        method: req.method,
        headers: req.headers,
        ...(!["GET", "HEAD"].includes(req.method)
          ? { body: Buffer.concat(chunks) }
          : {}),
      });
      const response = await handle(request, db);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.headers.get("content-type")?.startsWith("text/event-stream")) res.flushHeaders();
      if (response.body) await pipeline(Readable.fromWeb(response.body), res);
      else res.end();
      return;
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405, { allow: "GET, HEAD" });
      res.end();
      return;
    }
    const pathname = decodeURIComponent(url.pathname);
    if (
      pathname.includes("\0") ||
      pathname.split("/").some((x) => x.startsWith("."))
    ) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    let file = path.resolve(dist, "." + pathname);
    if (file !== dist && !file.startsWith(dist + path.sep)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    try {
      if ((await fs.stat(file)).isDirectory()) {
        if (!pathname.endsWith("/")) {
          res.writeHead(308, { location: url.pathname + "/" + url.search });
          res.end();
          return;
        }
        file = path.join(file, "index.html");
      }
    } catch {}
    const data = await fs.readFile(file);
    res.writeHead(200, {
      "content-type": mime[path.extname(file)] || "application/octet-stream",
      "x-content-type-options": "nosniff",
      "cache-control": "no-cache",
    });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch (err) {
    if (res.headersSent || res.destroyed) { res.destroy(); return; }
    res.writeHead(err instanceof URIError ? 400 : 404, {
      "content-type": "text/plain; charset=utf-8",
    });
    res.end(
      err instanceof URIError
        ? "Invalid path"
        : "页面不存在。请回到首页继续探索。",
    );
  }
});
const stopBrowserProxy = attachBrowserProxy(server, { handle, db, workbench, port });
server.once("error", error => { console.error("无法启动本地服务：", error.code || error.message); db.close(); serviceLock.release(); process.exit(1); });
server.listen(port, "127.0.0.1", () => {
  stopRunner = startDockerRunner(db, docker);
  stopCodex = startCodexRunner(db, agent, { guidance, workbench });
  console.log(`知图 · Knowledge Atlas: http://localhost:${port}`);
});
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => {
  if (stopping) return;
  stopping = true;
  const closed = new Promise(resolve => server.close(resolve));
  for (const request of requests) request.abort();
  stopBrowserProxy();
  await Promise.all([stopRunner(), stopCodex()]);
  await closed;
  db.close(); serviceLock.release();
  process.exit(0);
});
