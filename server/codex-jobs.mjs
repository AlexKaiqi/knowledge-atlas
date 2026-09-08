// Database lifecycle for the local CLI bridge. Codex owns the model/tool loop.
export const CODEX_ACTOR = "agent:codex";
export async function claimCodexJob(db, id) {
  const now = Date.now(), lease = crypto.randomUUID();
  const result = await db.prepare(
    "UPDATE ws_jobs SET status='running',lease=?,lease_until=?,attempt=attempt+1,updated_at=? WHERE id=? AND runner='codex' AND status='queued' AND NOT EXISTS (SELECT 1 FROM ws_jobs WHERE runner='codex' AND status='running') RETURNING *",
  ).bind(lease, now + 45000, now, id).all();
  return result.results[0] || null;
}

export async function renewCodexJob(db, job) {
  const now = Date.now();
  const result = await db.prepare(
    "UPDATE ws_jobs SET lease_until=? WHERE id=? AND lease=? AND status='running' AND lease_until>? RETURNING id",
  ).bind(now + 45000, job.id, job.lease, now).all();
  return result.results.length > 0;
}

export async function freezeCodexContext(db, job) {
  const input = JSON.parse(job.input);
  if (input.context) return input.context;
  const source = await db.prepare("SELECT rowid AS cursor FROM ws_messages WHERE id=? AND space=? AND actor!=?")
    .bind(input.messageId, job.space, CODEX_ACTOR).first();
  if (!source) throw new Error("原问题已不可用，无法继续回答。");
  // Freeze at execution time, so a queued follow-up includes the preceding reply.
  // Exclude human messages submitted after this question and replies to them.
  const rows = (await db.prepare(
    "SELECT m.id,m.body,m.actor,COALESCE(s.rowid,m.rowid) AS turn FROM ws_messages m LEFT JOIN ws_jobs j ON j.id=m.id AND j.runner='codex' LEFT JOIN ws_messages s ON s.id=json_extract(j.input,'$.messageId') AND s.space=m.space WHERE m.space=? AND ((m.actor!=? AND m.rowid<=?) OR (m.actor=? AND s.rowid<?)) ORDER BY turn DESC,m.rowid DESC LIMIT 30",
  ).bind(job.space, CODEX_ACTOR, source.cursor, CODEX_ACTOR, source.cursor).all()).results;
  let remaining = 32000;
  const messages = [];
  for (const row of rows) {
    if (row.body.length > remaining) break;
    messages.push({ id: row.id, role: row.actor === CODEX_ACTOR ? "assistant" : "user", body: row.body });
    remaining -= row.body.length;
  }
  const context = { messages: messages.reverse(), sourceMessageId: input.messageId, frozenAt: Date.now() };
  const frozen = JSON.stringify({ ...input, context });
  const updated = await db.prepare(
    "UPDATE ws_jobs SET input=? WHERE id=? AND lease=? AND status='running' AND lease_until>? RETURNING id",
  ).bind(frozen, job.id, job.lease, Date.now()).all();
  if (!updated.results.length) throw new Error("回答已停止。");
  job.input = frozen;
  return context;
}

export async function finishCodexJob(db, job, body, execution = {}) {
  if (typeof body !== "string" || !body.trim() || body.length > 24000)
    throw new Error("Codex 没有返回可显示的回答，请重试。");
  const now = Date.now();
  const condition = "EXISTS (SELECT 1 FROM ws_jobs WHERE id=? AND lease=? AND status='running' AND lease_until>?)";
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  const digest = Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2,"0")).join("");
  const result = await db.batch([
    db.prepare("INSERT OR IGNORE INTO ws_actors(id,name,preferences,created_at) VALUES (?,'Codex','{}',?)").bind(CODEX_ACTOR, now),
    db.prepare(`INSERT INTO ws_messages(id,space,actor,body,client_id,digest,created_at) SELECT ?,?,?,?,?,?,? WHERE ${condition}`)
      .bind(job.id, job.space, CODEX_ACTOR, body, job.id, digest, now, job.id, job.lease, now),
    db.prepare("UPDATE ws_jobs SET status='succeeded',input=?,lease=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease=? AND status='running' AND lease_until>? RETURNING id")
      .bind(JSON.stringify({ ...JSON.parse(job.input), execution, replyId: job.id }), now, job.id, job.lease, now),
    db.prepare("UPDATE ws_explorations SET updated_at=? WHERE id=? AND EXISTS (SELECT 1 FROM ws_messages WHERE id=? AND space=?)")
      .bind(now, job.space, job.id, job.space),
  ]);
  return result[2].results.length > 0;
}
