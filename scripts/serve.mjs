import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { root } from "./lib.mjs";
import { createApi } from "../server/api.mjs";
import { openLocalDatabase } from "../server/local-db.mjs";
import {
  dockerCapability,
  startDockerRunner,
} from "../server/docker-runner.mjs";
const port = Number(process.env.PORT || 8080),
  dist = path.join(root, "dist/client");
const db = openLocalDatabase(
  process.env.ATLAS_DB_PATH || path.join(root, ".data/atlas.sqlite"),
  path.join(root, "drizzle"),
);
const catalog = JSON.parse(
  await fs.readFile(path.join(root, ".generated/catalog.json"), "utf8"),
);
const docker = dockerCapability();
const stopRunner = startDockerRunner(db, docker);
const handle = createApi({ catalog, docker: !!docker });
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
        method: req.method,
        headers: req.headers,
        ...(!["GET", "HEAD"].includes(req.method)
          ? { body: Buffer.concat(chunks) }
          : {}),
      });
      const response = await handle(request, db);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
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
server.listen(port, "127.0.0.1", () =>
  console.log(`知图 · Knowledge Atlas: http://localhost:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(async () => {
      await stopRunner();
      db.close();
      process.exit(0);
    }),
  );
