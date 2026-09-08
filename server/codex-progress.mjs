// Public app-server events only. Never persist raw reasoning, credentials or tool results.
export function newCodexProgress() {
  return { stage: "connecting", startedAt: Date.now(), items: [] };
}

export function applyCodexEvent(progress, event) {
  const p = event.params || {}, method = event.method;
  const entry = (id, type) => {
    let item = progress.items.find(item => item.id === id);
    if (!item) {
      if (progress.items.length >= 40) {
        const old = progress.items.findIndex(item => item.status !== "running");
        progress.items.splice(old < 0 ? 0 : old, 1);
        progress.truncated = true;
      }
      item = { id: String(id).slice(0, 120), type, text: "", status: "running" };
      progress.items.push(item);
    }
    return item;
  };
  if (method === "bridge/stage") {
    if (["connecting", "workspace", "thinking", "answering", "working", "saving"].includes(p.stage)) progress.stage = p.stage;
  } else if (method === "turn/started") progress.stage = "thinking";
  else if (method === "item/agentMessage/delta") {
    const item = entry(p.itemId, "message");
    if (item && typeof p.delta === "string") item.text = (item.text + p.delta).slice(0, 24000);
    progress.stage = "answering";
  } else if (["item/started", "item/completed"].includes(method)) {
    const native = p.item || {};
    const completed = method === "item/completed";
    if (native.type === "agentMessage") {
      const item = entry(native.id, "message");
      if (item) {
        if (typeof native.text === "string") item.text = native.text.slice(0, 24000);
        item.phase = native.phase || "";
        item.status = completed ? "completed" : "running";
      }
    } else if (["mcpToolCall", "commandExecution", "fileChange", "webSearch"].includes(native.type)) {
      const item = entry(native.id, "tool");
      if (item) {
        item.text = native.type === "mcpToolCall" ? `${native.server || "工具"} · ${native.tool || "执行"}`
          : ({ commandExecution: "执行命令", fileChange: "修改文件", webSearch: "检索资料" })[native.type];
        item.text = item.text.slice(0, 200);
        item.status = native.status === "failed" || native.error ? "failed" : completed ? "completed" : "running";
      }
      progress.stage = "working";
    }
  } else if (method === "turn/completed") progress.stage = "saving";
  progress.updatedAt = Date.now();
  return progress;
}

export async function saveCodexProgress(db, job, progress) {
  // A cancelled or expired worker must not append even a partial reply.
  while (JSON.stringify(progress).length > 95000 && progress.items.length > 1) {
    progress.items.shift(); progress.truncated = true;
  }
  const body = JSON.stringify(progress);
  const result = await db.prepare(
    "UPDATE ws_jobs SET progress=?,progress_version=progress_version+1 WHERE id=? AND lease=? AND status='running' AND lease_until>? RETURNING id",
  ).bind(body, job.id, job.lease, Date.now()).all();
  return result.results.length > 0;
}

export async function readWorkspaceJobs(db, space, actor = null) {
  const { results } = await db.prepare(
    "SELECT id,runner,status,attempt,error,artifact,json_extract(input,'$.prompt') AS prompt,json_extract(input,'$.messageId') AS messageId,progress,progress_version AS progressVersion,created_at AS createdAt,updated_at AS updatedAt FROM ws_jobs WHERE space=? AND (? IS NULL OR EXISTS (SELECT 1 FROM ws_explorations e WHERE e.id=ws_jobs.space AND (e.visibility='shared' OR EXISTS (SELECT 1 FROM ws_members m WHERE m.space=e.id AND m.actor=?)))) ORDER BY created_at DESC,rowid DESC LIMIT 100",
  ).bind(space, actor, actor).all();
  return results.map(job => ({ ...job, progress: JSON.parse(job.progress || "{}") }));
}

// Each connection starts with a complete bounded snapshot. Reconnects do not
// replay model calls and need no unbounded event log. Revisions prevent rollback.
export function workspaceJobStream(db, { space, actor, signal, intervalMs = 150, lifetimeMs = 55000 }) {
  const encoder = new TextEncoder();
  let timer, deadline, stopped = false, busy = false, controller, lastSent = 0;
  const sent = new Map();
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer); clearTimeout(deadline);
    signal?.removeEventListener("abort", stop);
    try { controller?.close(); } catch {}
  };
  const send = (event, data) => {
    if (stopped) return;
    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    lastSent = Date.now();
  };
  const tick = async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      const allowed = await db.prepare(
        "SELECT e.id FROM ws_explorations e WHERE e.id=? AND (e.visibility='shared' OR EXISTS (SELECT 1 FROM ws_members m WHERE m.space=e.id AND m.actor=?))",
      ).bind(space, actor).first();
      if (stopped) return;
      if (!allowed) { send("denied", {}); stop(); return; }
      const jobs = await readWorkspaceJobs(db, space, actor);
      if (stopped) return;
      const changed = jobs.filter(j => {
        const signature = JSON.stringify([j.status, j.updatedAt, j.progressVersion]);
        if (sent.get(j.id) === signature) return false;
        sent.set(j.id, signature); return true;
      });
      if (changed.length) send("jobs", { space, jobs: changed });
      else if (Date.now() - lastSent > 10000) send("ping", {});
      if (!jobs.some(j => j.runner === "codex" && ["queued", "running"].includes(j.status))) {
        send("settled", {}); stop();
      }
    } catch { if (!stopped) { send("unavailable", {}); stop(); } }
    finally { busy = false; }
  };
  const body = new ReadableStream({
    start(c) {
      controller = c;
      if (signal?.aborted) { stop(); return; }
      signal?.addEventListener("abort", stop, { once: true });
      timer = setInterval(tick, intervalMs);
      deadline = setTimeout(stop, lifetimeMs);
      tick();
    },
    cancel: stop,
  });
  return new Response(body, { headers: {
    "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store",
    "x-accel-buffering": "no", "x-content-type-options": "nosniff",
  } });
}
