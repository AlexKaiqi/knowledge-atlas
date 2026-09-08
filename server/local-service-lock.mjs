import fs from "node:fs";
import path from "node:path";
// A local database owns one runner process. Different test databases remain independent.
export function acquireServiceLock(databasePath) {
  const resolved = path.resolve(databasePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const canonical = fs.existsSync(resolved) ? fs.realpathSync(resolved) : path.join(fs.realpathSync(path.dirname(resolved)), path.basename(resolved));
  const file = canonical + ".serve-lock";
  const owner = JSON.stringify({ pid: process.pid, nonce: crypto.randomUUID() });
  for (let attempt = 0; attempt < 2; attempt++) {
    try { fs.writeFileSync(file, owner, { flag: "wx", mode: 0o600 }); break; }
    catch (error) {
      if (error.code !== "EEXIST") throw error;
      let previous;
      try { previous = fs.readFileSync(file, "utf8"); } catch { continue; }
      let pid;
      try { pid = JSON.parse(previous).pid; } catch {}
      if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error("服务锁不完整，请先确认旧服务已停止，再移除 " + file);
      let alive = true;
      try { process.kill(pid, 0); } catch (e) { if (e.code === "ESRCH") alive = false; }
      if (alive || attempt) throw new Error("此数据库已有本地服务运行；请复用该服务，或使用独立 ATLAS_DB_PATH。");
      if (fs.readFileSync(file, "utf8") === previous) fs.unlinkSync(file);
    }
  }
  const release = () => { try { if (fs.readFileSync(file, "utf8") === owner) fs.unlinkSync(file); } catch {} };
  process.once("exit", release);
  return { databasePath: canonical, release() { process.removeListener("exit", release); release(); } };
}
