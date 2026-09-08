import { claimCodexJob, renewCodexJob, freezeCodexContext, finishCodexJob } from "./codex-jobs.mjs";
import { failJob, recoverJobs } from "./jobs.mjs";
import { runCodex } from "./codex-cli.mjs";
import { newCodexProgress, applyCodexEvent, saveCodexProgress } from "./codex-progress.mjs";

export function startCodexRunner(db, configuration, { guidance, invoke = runCodex, workbench = null, intervalMs = 200, heartbeatMs = 500 } = {}) {
  let closed = false, ticking = false, active = null;
  async function execute(id) {
    if (closed) return;
    const job = await claimCodexJob(db, id);
    if (!job) return;
    if (closed) { await failJob(db, job, "本地服务已停止，可以重试回答。"); return; }
    const abort = new AbortController();
    const running = { abort, done: null };
    active = running;
    let checking = false;
    const heartbeat = setInterval(async () => {
      if (checking) return;
      checking = true;
      try { if (!await renewCodexJob(db, job)) abort.abort(); }
      catch { abort.abort(); }
      finally { checking = false; }
    }, heartbeatMs);
    running.done = (async () => {
      const progress = newCodexProgress();
      let dirty = false, writing = Promise.resolve(), ownsWorkbench = false, failed = false;
      const flush = () => {
        if (!dirty) return writing;
        dirty = false;
        const snapshot = JSON.parse(JSON.stringify(progress));
        writing = writing.then(async () => { if (!await saveCodexProgress(db, job, snapshot)) abort.abort(); });
        return writing;
      };
      const onEvent = event => { applyCodexEvent(progress, event); dirty = true; };
      const streamTimer = setInterval(() => flush().catch(() => abort.abort()), 150);
      try {
        const context = await freezeCodexContext(db, job);
        onEvent({ method: "bridge/stage", params: { stage: "connecting" } });
        await flush();
        let mcpServers = {};
        if (workbench?.available) {
          onEvent({ method: "bridge/stage", params: { stage: "workspace" } });
          await flush();
          ownsWorkbench = true;
          try { mcpServers = await workbench.mcpServers(job.space, { signal: abort.signal }); }
          catch (error) { context.workbenchUnavailable = error.message; }
        }
        onEvent({ method: "bridge/stage", params: { stage: "connecting" } });
        await flush();
        if (closed || abort.signal.aborted) throw new Error("回答已停止。");
        const result = await invoke(configuration, { guidance, context, signal: abort.signal, onEvent, mcpServers });
        await flush();
        if (!abort.signal.aborted) await finishCodexJob(db, job, result.body, result.execution);
      } catch (error) {
        failed = true;
        await flush().catch(() => {});
        await failJob(db, job, error.message);
      } finally {
        clearInterval(streamTimer);
        await writing.catch(() => {});
        if ((abort.signal.aborted || failed) && ownsWorkbench) await workbench.stop(job.space, { guard: async () => !await db.prepare("SELECT id FROM ws_jobs WHERE space=? AND runner='codex' AND status='running' AND lease_until>? AND (id!=? OR lease!=?) LIMIT 1").bind(job.space, Date.now(), job.id, job.lease).first() }).catch(() => {});
        clearInterval(heartbeat);
        active = null;
      }
    })();
    await running.done;
  }
  async function tick() {
    if (closed || ticking || active) return;
    ticking = true;
    try {
      await recoverJobs(db);
      if (closed) return;
      if (!configuration?.available) {
        await db.prepare("UPDATE ws_jobs SET status='failed',error=?,updated_at=? WHERE runner='codex' AND status='queued'")
          .bind(configuration?.reason || "Codex 尚未连接，请连接后重试。", Date.now()).run();
        return;
      }
      const job = await db.prepare("SELECT id FROM ws_jobs WHERE runner='codex' AND status='queued' ORDER BY created_at,rowid LIMIT 1").bind().first();
      if (job && !closed) await execute(job.id);
    } finally { ticking = false; }
  }
  const timer = setInterval(() => tick().catch(() => {}), intervalMs);
  tick().catch(() => {});
  return async () => {
    closed = true; clearInterval(timer);
    if (active) { active.abort.abort(); await active.done; }
    while (ticking) {
      active?.abort.abort();
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  };
}
