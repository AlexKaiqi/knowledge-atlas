// One native Codex invocation per reply. No model SDK, credentials proxy or tool loop.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function cliEnvironment() {
  const names = ["HOME", "PATH", "LANG", "LC_ALL", "TMPDIR", "SYSTEMROOT", "USERPROFILE", "CODEX_HOME"];
  return Object.fromEntries(names.filter(k => process.env[k]).map(k => [k, process.env[k]]));
}
export function codexCapability() {
  if (process.env.ATLAS_CODEX === "off") return { available: false, reason: "此本地服务已关闭 Codex。问题仍会保存。" };
  const candidates = process.env.ATLAS_CODEX_BIN ? [process.env.ATLAS_CODEX_BIN] : ["codex", ...(process.platform === "darwin" ? ["/Applications/ChatGPT.app/Contents/Resources/codex"] : [])];
  for (const bin of candidates) {
    try {
      const options = { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "pipe"], env: cliEnvironment() };
      const version = execFileSync(bin, ["--version"], options).trim();
      const help = execFileSync(bin, ["app-server", "--help"], options);
      if (!help.includes("--stdio")) continue;
      if (!fs.existsSync(path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "auth.json"))) return { available: false, reason: "当前登录仅在系统钥匙串中，网页桥接尚不支持这种认证方式。" };
      try { execFileSync(bin, ["login", "status"], options); }
      catch { return { available: false, reason: "Codex CLI 尚未登录，请在本机完成 codex login 后重启服务。" }; }
      return { available: true, bin, version };
    } catch {}
  }
  return { available: false, reason: "未找到可用的 Codex CLI。请配置 ATLAS_CODEX_BIN，登录后重启本地服务。" };
}


export { runCodex } from "./codex-app-server.mjs";
