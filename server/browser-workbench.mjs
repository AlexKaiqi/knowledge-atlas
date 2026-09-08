// Thin local AIO lifecycle adapter; the caller must hold one
// exclusive serve lock per canonical database path. No model/tool scheduler here.
import fs from "node:fs/promises";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
const exec = promisify(execFile);
export const SANDBOX_IMAGE = "ghcr.io/agent-infra/sandbox:1.11.0@sha256:6328d7fd2f0ff0b4c147c3d05b3df1ce331f4a482eb6e550ecd64ed1fcf906e7";
const validId = /^[a-f0-9-]{36}$/;
const check = signal => signal?.throwIfAborted();

export function browserCapability() {
  if (process.env.ATLAS_BROWSER === "off") return { available: false, reason: "本地浏览器环境已关闭。" };
  const image = process.env.ATLAS_SANDBOX_IMAGE || SANDBOX_IMAGE;
  try {
    execFileSync("docker", ["image", "inspect", image], { stdio: "ignore", timeout: 5000 });
    return { available: true, image };
  } catch { return { available: false, reason: "尚未准备 AIO Sandbox 镜像；见浏览器接入说明。" }; }
}

export function createBrowserWorkbench({ directory, databasePath, configuration = browserCapability(), maxRunning = 2 }) {
  const namespace = createHash("sha256").update(path.resolve(databasePath)).digest("hex").slice(0, 12);
  const base = path.resolve(directory, namespace);
  const controls = new Map(), failures = new Map(), health = new Map();
  const tails = new Map(), preparing = new Map(), imageIds = new Map();
  let creation = Promise.resolve();
  const name = id => {
    if (!validId.test(id)) throw new Error("探索标识无效。");
    return `atlas-browser-${namespace}-${id}`;
  };
  const docker = async (args, { signal } = {}) => (await exec("docker", args,
    { timeout: 25000, maxBuffer: 2 * 1024 * 1024, ...(signal ? { signal } : {}) })).stdout;
  async function inspect(id, { signal } = {}) {
    try { return JSON.parse(await docker(["inspect", name(id)], { signal }))[0]; }
    catch (error) {
      check(signal);
      if (/No such (object|container)/i.test(String(error.stderr || ""))) return null;
      throw new Error("暂时无法读取 Docker 环境状态，请检查本机 Docker。");
    }
  }
  function serial(id, action) {
    name(id);
    const previous = tails.get(id) || Promise.resolve();
    const pending = previous.catch(() => {}).then(action);
    tails.set(id, pending);
    const clear = () => { if (tails.get(id) === pending) tails.delete(id); };
    pending.then(clear, clear);
    return pending;
  }
  function createSerial(action) {
    const pending = creation.catch(() => {}).then(action);
    creation = pending;
    return pending;
  }
  async function control(id, { signal } = {}) {
    check(signal); name(id);
    if (controls.has(id)) return controls.get(id);
    const folder = path.join(base, id);
    await fs.mkdir(folder, { recursive: true, mode: 0o700 }); check(signal);
    const file = path.join(folder, "connection.json");
    let value;
    try { value = JSON.parse(await fs.readFile(file, "utf8")); }
    catch (error) {
      if (error.code !== "ENOENT") throw new Error("环境连接记录无法读取；请保留工作文件并检查本地记录。");
      check(signal);
      const keys = generateKeyPairSync("rsa", { modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
      value = { version: 1, image: configuration.image, createdAt: Date.now(), ...keys };
      await fs.writeFile(file, JSON.stringify(value), { flag: "wx", mode: 0o600 });
    }
    check(signal);
    if (value.version !== 1 || typeof value.image !== "string" || !value.image ||
        typeof value.privateKey !== "string" || typeof value.publicKey !== "string")
      throw new Error("环境连接记录不完整；不会自动覆盖已有记录或文件。");
    controls.set(id, value);
    return value;
  }
  const token = (c, seconds = 900) => {
    const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
    const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ exp: Math.floor(Date.now() / 1000) + seconds })}`;
    return `${unsigned}.${sign("RSA-SHA256", Buffer.from(unsigned), c.privateKey).toString("base64url")}`;
  };
  async function validateContainer(id, data, c, { signal } = {}) {
    const folder = path.join(base, id, "workspace");
    const realFolder = await fs.realpath(folder).catch(() => folder);
    if (!imageIds.has(c.image)) {
      const images = JSON.parse(await docker(["image", "inspect", c.image], { signal }));
      if (!images[0]?.Id) throw new Error("无法核实环境镜像。");
      imageIds.set(c.image, images[0].Id);
    }
    const labels = data.Config?.Labels || {}, mounts = data.Mounts || [];
    const mount = mounts.find(m => m.Destination === "/home/gem/workspace");
    const bindings = data.HostConfig?.PortBindings?.["8080/tcp"] || [];
    const jwt = `JWT_PUBLIC_KEY=${Buffer.from(c.publicKey).toString("base64")}`;
    if (labels["atlas.browser.namespace"] !== namespace || labels["atlas.browser.space"] !== id ||
        data.Config?.Image !== c.image || data.Image !== imageIds.get(c.image) ||
        !mount || mount.Type !== "bind" || !mount.RW ||
        ![path.resolve(folder), path.resolve(realFolder)].includes(path.resolve(mount.Source || "/")) ||
        mounts.some(m => m.Type === "bind" && m.Destination !== "/home/gem/workspace") ||
        !bindings.length || bindings.some(b => b.HostIp !== "127.0.0.1") ||
        !data.Config?.Env?.includes(jwt))
      throw new Error("同名容器与本探索的镜像、挂载或连接记录不匹配；未启动或停止它，工作文件仍保留。");
    check(signal);
  }
  async function endpoint(id, { signal, data } = {}) {
    check(signal);
    data ||= await inspect(id, { signal });
    const port = data?.NetworkSettings?.Ports?.["8080/tcp"]?.find(p => p.HostIp === "127.0.0.1")?.HostPort;
    if (!data?.State?.Running || !port) throw new Error("浏览器环境已暂停。重新连接可继续，文件仍保留。");
    const c = await control(id, { signal });
    await validateContainer(id, data, c, { signal });
    return { baseUrl: `http://127.0.0.1:${port}`, token: token(c), containerId: data.Id };
  }
  async function getJson(e, route, options = {}) {
    const headers = new Headers(options.headers); headers.set("Authorization", `Bearer ${e.token}`);
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(6000)]) : AbortSignal.timeout(6000);
    const result = await fetch(e.baseUrl + route, { ...options, headers, signal, redirect: "error" });
    if (!result.ok) throw new Error(`环境服务暂不可用（${result.status}）。`);
    return result.json();
  }
  async function request(id, route, options = {}) {
    return getJson(await endpoint(id, { signal: options.signal }), route, options);
  }
  async function start(id, { signal } = {}) {
    check(signal);
    if (!configuration.available) throw new Error(configuration.reason);
    const c = await control(id, { signal });
    const folder = path.join(base, id, "workspace");
    check(signal); await fs.mkdir(folder, { recursive: true, mode: 0o777 });
    // The parent remains host-private; only this child is bound into the container.
    await fs.chmod(folder, 0o777); check(signal);
    await createSerial(async () => {
      check(signal);
      const current = await inspect(id, { signal });
      if (current) await validateContainer(id, current, c, { signal });
      if (!current?.State?.Running) {
        const running = (await docker(["ps", "-q", "--filter", `label=atlas.browser.namespace=${namespace}`], { signal })).trim().split("\n").filter(Boolean);
        if (running.length >= maxRunning) throw new Error(`已有 ${maxRunning} 个浏览器环境在运行。请暂停一个暂时不用的环境后继续。`);
        check(signal);
        // Do not abort a mutating Docker CLI halfway: the daemon could still finish
        // creating the container. Observe command completion, then honour cancellation.
        if (current) await docker(["start", current.Id]);
        else await docker(["run", "-d", "--name", name(id),
          "--label", `atlas.browser.namespace=${namespace}`, "--label", `atlas.browser.space=${id}`,
          "--cpus", "2", "--memory", "3g", "--pids-limit", "512", "--shm-size", "512m",
          "--security-opt", "seccomp=unconfined", "-p", "127.0.0.1::8080",
          "--mount", `type=bind,src=${folder},dst=/home/gem/workspace`,
          "-e", "WORKSPACE=/home/gem/workspace", "-e", "DISABLE_JUPYTER=true", "-e", "DISABLE_CODE_SERVER=true",
          "-e", `JWT_PUBLIC_KEY=${Buffer.from(c.publicKey).toString("base64")}`, c.image]);
        health.delete(id);
      }
      check(signal);
    });
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      check(signal);
      try {
        const data = await request(id, "/cdp/json/version", { signal });
        check(signal);
        if (data.webSocketDebuggerUrl) {
          failures.delete(id); health.delete(id); return;
        }
      } catch { check(signal); }
      await pause(500, undefined, { signal });
    }
    throw new Error("浏览器启动较慢，请稍后重新连接。文件不会被清理。");
  }
  async function ensure(id, { signal } = {}) {
    check(signal); name(id);
    preparing.set(id, (preparing.get(id) || 0) + 1);
    try { await serial(id, () => start(id, { signal })); }
    catch (error) { if (!signal?.aborted) failures.set(id, error.message); throw error; }
    finally {
      const left = (preparing.get(id) || 1) - 1;
      if (left) preparing.set(id, left); else preparing.delete(id);
    }
  }
  async function status(id) {
    name(id);
    if (!configuration.available) return { ...configuration };
    const result = { available: true, provider: "AIO Sandbox", image: configuration.image,
      socketPath: `/api/workspace/spaces/${id}/browser/socket`, reason: null };
    try {
      const data = await inspect(id);
      result.image = data?.Config?.Image || result.image; result.imageId = data?.Image || null;
      if (preparing.has(id)) return { ...result, state: "starting" };
      if (!data?.State?.Running) { health.delete(id); return { ...result, state: failures.has(id) ? "failed" : data ? "paused" : "new", reason: failures.get(id) || null }; }
      let recent = health.get(id);
      if (!recent || recent.containerId !== data.Id || Date.now() - recent.checkedAt > 5000) {
        try {
          const e = await endpoint(id, { data });
          const browser = await getJson(e, "/cdp/json/version");
          if (!browser.webSocketDebuggerUrl) throw new Error("浏览器仍在准备中，请稍后重新连接。");
          recent = { containerId: data.Id, checkedAt: Date.now(), ok: true }; failures.delete(id);
        } catch (error) { recent = { containerId: data.Id, checkedAt: Date.now(), ok: false, reason: error.message }; }
        health.set(id, recent);
      }
      return { ...result, state: recent.ok ? "running" : "failed", reason: recent.reason || null };
    } catch (error) { return { ...result, state: "failed", reason: error.message }; }
  }
  async function stop(id, { guard = async () => true } = {}) {
    return serial(id, async () => {
      // The caller supplies the live DB check; it runs here, not before queuing.
      if (!await guard()) return false;
      const data = await inspect(id);
      if (data) await validateContainer(id, data, await control(id));
      if (data?.State?.Running) {
        if (!await guard()) return false;
        // Use the inspected immutable container ID, never a broad namespace filter.
        await docker(["stop", "--time", "5", data.Id]);
      }
      failures.delete(id); health.delete(id); return true;
    });
  }
  async function mcpServers(id, { signal } = {}) {
    await ensure(id, { signal }); check(signal);
    const e = await endpoint(id, { signal }); check(signal);
    // Current native turns are bounded to three minutes; mint a new 15-minute
    // token for every turn. A long-lived future app-server needs a refresh proxy.
    return { atlas_workspace: { url: e.baseUrl + "/mcp", http_headers: { Authorization: `Bearer ${e.token}` }, startup_timeout_sec: 30, tool_timeout_sec: 90 } };
  }
  async function browserSocket(id, { signal } = {}) {
    const e = await endpoint(id, { signal });
    const data = await getJson(e, "/cdp/json/version", { signal });
    const advertised = new URL(data.webSocketDebuggerUrl);
    if (!["ws:", "wss:"].includes(advertised.protocol) ||
        (!advertised.pathname.startsWith("/cdp/") && !advertised.pathname.startsWith("/devtools/browser/")))
      throw new Error("浏览器连接路径无效。");
    const url = new URL(advertised.pathname + advertised.search, e.baseUrl); url.protocol = "ws:";
    return { url: url.href, headers: { Authorization: `Bearer ${e.token}` } };
  }
  return { ...configuration, namespace, ensure, status, stop, mcpServers, browserSocket, request };
}
