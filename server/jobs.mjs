import {
  parallelModel,
  causalModel,
} from "../site/runtime/core/learning-models.js";
export async function claimJob(db, id) {
  const lease = crypto.randomUUID(),
    now = Date.now();
  const result = await db
    .prepare(
      "UPDATE ws_jobs SET status='running',lease=?,lease_until=?,attempt=attempt+1,updated_at=? WHERE id=? AND status='queued' RETURNING *",
    )
    .bind(lease, now + 45000, now, id)
    .all();
  return result.results[0] || null;
}
export async function finishJob(db, job, { title, kind, body, metadata }) {
  const id = crypto.randomUUID(),
    now = Date.now();
  // Every statement is guarded by the same lease. Cancellation and stale workers
  // cannot leave orphan results or overwrite a replacement worker's output.
  const condition =
    "EXISTS (SELECT 1 FROM ws_jobs WHERE id=? AND lease=? AND status='running' AND lease_until>?)";
  const result = await db.batch([
    db
      .prepare(
        `INSERT INTO ws_artifacts(id,space,title,kind,version,created_at) SELECT ?,?,?,?,1,? WHERE ${condition}`,
      )
      .bind(id, job.space, title, kind, now, job.id, job.lease, now),
    db
      .prepare(
        `INSERT INTO ws_artifact_versions(artifact,version,body,metadata,actor,job,created_at) SELECT ?,1,?,?,?,?,? WHERE ${condition}`,
      )
      .bind(
        id,
        body,
        JSON.stringify({
          ...metadata,
          input: JSON.parse(job.input),
          runner: job.runner,
          attempt: job.attempt,
          origin: "execution",
        }),
        job.actor,
        job.id,
        now,
        job.id,
        job.lease,
        now,
      ),
    db
      .prepare(
        `UPDATE ws_jobs SET status='succeeded',artifact=?,lease=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease=? AND status='running' AND lease_until>? RETURNING id`,
      )
      .bind(id, now, job.id, job.lease, now),
    db
      .prepare(
        `UPDATE ws_explorations SET updated_at=? WHERE id=? AND EXISTS (SELECT 1 FROM ws_jobs WHERE id=? AND artifact=?)`,
      )
      .bind(now, job.space, job.id, id),
  ]);
  return result[2].results.length > 0;
}
export async function failJob(db, job, error) {
  await db
    .prepare(
      "UPDATE ws_jobs SET status='failed',error=?,lease=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease=? AND status='running'",
    )
    .bind(String(error).slice(0, 1500), Date.now(), job.id, job.lease)
    .run();
}
export async function runBuiltinJob(db, id) {
  const job = await claimJob(db, id);
  if (!job) return;
  try {
    const input = JSON.parse(job.input);
    let result, title, boundary;
    if (job.runner === "parallel") {
      result = parallelModel(input.p, input.s);
      title = "并行协作 · 一次条件比较";
      boundary =
        "固定总工作量，忽略通信、调度与竞争成本；这是模型计算，不是现实测量。";
    } else if (job.runner === "causal") {
      result = causalModel(input.rain, input.mode);
      title = "相关与因果 · 一次条件比较";
      boundary =
        "教学模型的概率由作者设定；干预比较依赖模型结构，不是雨伞的真实效果测量。";
    } else throw new Error("执行器不匹配");
    await finishJob(db, job, {
      title,
      kind: "model",
      body: JSON.stringify(result),
      metadata: { modelVersion: "1", boundary },
    });
  } catch (error) {
    await failJob(db, job, error.message);
  }
}
export async function recoverJobs(db) {
  // A crashed execution is not blindly repeated; it remains visible and retryable.
  await db
    .prepare(
      "UPDATE ws_jobs SET status='failed',error='执行器中断或租约过期。可查看已保存条件并重试。',lease=NULL,lease_until=NULL,updated_at=? WHERE status='running' AND lease_until<?",
    )
    .bind(Date.now(), Date.now())
    .run();
  const jobs = (
    await db
      .prepare(
        "SELECT id FROM ws_jobs WHERE status='queued' AND runner IN ('parallel','causal') ORDER BY created_at LIMIT 20",
      )
      .bind()
      .all()
  ).results;
  for (const j of jobs) await runBuiltinJob(db, j.id);
}
