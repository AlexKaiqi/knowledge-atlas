import { runBuiltinJob } from "./jobs.mjs";
export class WorkspaceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const fail = (message, status = 400) => {
  throw new WorkspaceError(message, status);
};
const str = (v, label, max = 12000, min = 1) =>
  typeof v === "string" && v.trim().length >= min && v.length <= max
    ? v.trim()
    : fail(`${label}需要 ${min}–${max} 个字符。`);
const uid = () => crypto.randomUUID();
const hash = async (v) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
export async function workspace(
  req,
  db,
  { owner, reply, payload, catalog, account = null, docker = false },
) {
  const url = new URL(req.url),
    route = url.pathname.slice("/api/workspace".length),
    post = req.method === "POST",
    now = Date.now();
  const actor = account?.id
    ? `account:${await hash(account.id)}`
    : `visitor:${owner}`;
  const one = (sql, ...args) =>
    db
      .prepare(sql)
      .bind(...args)
      .first();
  const all = async (sql, ...args) =>
    (
      await db
        .prepare(sql)
        .bind(...args)
        .all()
    ).results;
  const stmt = (sql, ...args) => db.prepare(sql).bind(...args);
  const run = (sql, ...args) => stmt(sql, ...args).run();
  await run(
    "INSERT OR IGNORE INTO ws_actors(id,name,preferences,created_at) VALUES (?,?,?,?)",
    actor,
    account?.name || "探索者",
    "{}",
    now,
  );
  const me = await one(
    "SELECT name,preferences FROM ws_actors WHERE id=?",
    actor,
  );
  const capabilities = {
    agent: false,
    docker,
    builtin: true,
    voice: "browser",
    account: !!account?.id,
  };
  // A lost response must be replayed before checking a now-stale baseVersion.
  if (post) {
    const p = await payload(req.clone());
    if (p.requestId) {
      const prior = await one(
        "SELECT digest,response FROM ws_requests WHERE actor=? AND key=?",
        actor,
        str(p.requestId, "请求标识", 80),
      );
      if (prior) {
        if (prior.digest !== (await hash(req.url + "\n" + JSON.stringify(p))))
          fail("这次提交的标识已用于不同内容，请重新提交。", 409);
        return reply(JSON.parse(prior.response), 201);
      }
    }
  }
  async function access(id, write = false) {
    const s = await one(
      "SELECT e.*,m.role FROM ws_explorations e LEFT JOIN ws_members m ON m.space=e.id AND m.actor=? WHERE e.id=?",
      actor,
      id,
    );
    if (!s || (!s.role && s.visibility !== "shared"))
      fail("探索不存在，或你没有访问权限。", 404);
    if (write && !s.role) fail("先加入这段共同探索，再参与编辑。", 403);
    return s;
  }
  async function idempotent(p, make) {
    const key = str(p.requestId, "请求标识", 80),
      digest = await hash(req.url + "\n" + JSON.stringify(p));
    const previous = await one(
      "SELECT digest,response FROM ws_requests WHERE actor=? AND key=?",
      actor,
      key,
    );
    const replay = (r) => {
      if (r.digest !== digest)
        fail("这次提交的标识已用于不同内容，请重新提交。", 409);
      return JSON.parse(r.response);
    };
    if (previous) return replay(previous);
    const { statements, response } = await make();
    try {
      await db.batch([
        ...statements,
        stmt(
          "INSERT INTO ws_requests(actor,key,digest,response,created_at) VALUES (?,?,?,?,?)",
          actor,
          key,
          digest,
          JSON.stringify(response),
          now,
        ),
      ]);
    } catch (error) {
      const prior = await one(
        "SELECT digest,response FROM ws_requests WHERE actor=? AND key=?",
        actor,
        key,
      );
      if (prior) return replay(prior);
      if (/UNIQUE|constraint/i.test(error.message))
        fail("内容已被更新，请重新载入并比较版本。", 409);
      throw error;
    }
    return response;
  }
  if (
    post &&
    (
      await one(
        "SELECT COUNT(*) AS count FROM ws_requests WHERE actor=? AND created_at>?",
        actor,
        now - 60000,
      )
    ).count >= 60
  )
    fail("这一分钟提交较多，请稍后继续。", 429);
  const touch = (id) =>
    stmt("UPDATE ws_explorations SET updated_at=? WHERE id=?", now, id);
  async function docAccess(id) {
    const d = await one("SELECT * FROM ws_documents WHERE id=?", id);
    if (!d || (d.owner !== actor && d.visibility !== "shared"))
      fail("知识不存在，或你没有访问权限。", 404);
    return d;
  }
  if (route === "/session" && !post)
    return reply({
      name: me.name,
      preferences: JSON.parse(me.preferences),
      capabilities,
      identity: account?.id ? "account" : "visitor",
      message: account?.id
        ? "已使用站点账号保存探索。"
        : "记录保存在服务端，与当前浏览器凭据关联。可导出备份；清除 Cookie 会失去访问凭据。",
    });
  if (route === "/profile" && post) {
    const p = await payload(req);
    const name = str(p.name, "称呼", 40);
    const preferences = {
      goals: str(p.goals || "", "学习目标", 1500, 0),
      interests: str(p.interests || "", "兴趣", 1500, 0),
      guidance: str(p.guidance || "", "希望怎样获得帮助", 1500, 0),
    };
    await run(
      "UPDATE ws_actors SET name=?,preferences=? WHERE id=?",
      name,
      JSON.stringify(preferences),
      actor,
    );
    return reply({ saved: true });
  }
  if (route === "/spaces" && !post) {
    const shared = url.searchParams.get("view") === "shared";
    return reply({
      spaces: await all(
        `SELECT e.id,e.title,e.visibility,e.version,e.updated_at AS updatedAt,m.role FROM ws_explorations e LEFT JOIN ws_members m ON m.space=e.id AND m.actor=? WHERE ${shared ? "e.visibility='shared'" : "m.actor IS NOT NULL"} ORDER BY e.updated_at DESC LIMIT 100`,
        actor,
      ),
    });
  }
  if (route === "/spaces" && post) {
    const p = await payload(req);
    const body = str(p.body, "问题");
    const result = await idempotent(p, async () => {
      const id = uid(),
        messageId = uid();
      return {
        response: { id, messageId },
        statements: [
          stmt(
            "INSERT INTO ws_explorations(id,owner,title,visibility,version,created_at,updated_at) VALUES (?,?,?,?,1,?,?)",
            id,
            actor,
            body.slice(0, 80),
            "private",
            now,
            now,
          ),
          stmt(
            "INSERT INTO ws_members(space,actor,role,joined_at) VALUES (?,?,?,?)",
            id,
            actor,
            "owner",
            now,
          ),
          stmt(
            "INSERT INTO ws_messages(id,space,actor,body,client_id,digest,created_at) VALUES (?,?,?,?,?,?,?)",
            messageId,
            id,
            actor,
            body,
            p.requestId,
            await hash(body),
            now,
          ),
          stmt(
            "INSERT INTO ws_jobs(id,space,actor,runner,input,status,attempt,created_at,updated_at) VALUES (?,?,?,?,?,?,0,?,?)",
            uid(),
            id,
            actor,
            "agent",
            JSON.stringify({ prompt: body }),
            "waiting_provider",
            now,
            now,
          ),
        ],
      };
    });
    return reply(result, 201);
  }
  const sm = route.match(/^\/spaces\/([a-f0-9-]{36})(?:\/(.*))?$/);
  if (sm) {
    const id = sm[1],
      action = sm[2] || "",
      space = await access(id, post && !["join"].includes(action));
    if (!action && !post) {
      const before = Number(
        url.searchParams.get("before") || Number.MAX_SAFE_INTEGER,
      );
      if (!Number.isSafeInteger(before) || before < 0) fail("无效的消息游标。");
      const messages = await all(
        "SELECT m.rowid AS cursor,m.id,m.body,m.created_at AS createdAt,a.name,m.actor=? AS mine FROM ws_messages m JOIN ws_actors a ON a.id=m.actor WHERE m.space=? AND m.rowid<? ORDER BY m.rowid DESC LIMIT 80",
        actor,
        id,
        before,
      );
      const artifacts = await all(
        "SELECT a.id,a.title,a.kind,a.version,v.body,v.metadata,v.job,v.source_message AS sourceMessage,v.created_at AS createdAt,n.name FROM ws_artifacts a JOIN ws_artifact_versions v ON v.artifact=a.id AND v.version=a.version JOIN ws_actors n ON n.id=v.actor WHERE a.space=? ORDER BY v.created_at DESC LIMIT 100",
        id,
      );
      const jobs = await all(
        "SELECT id,runner,status,attempt,error,artifact,created_at AS createdAt,updated_at AS updatedAt FROM ws_jobs WHERE space=? ORDER BY created_at DESC LIMIT 100",
        id,
      );
      const members = await all(
        "SELECT a.name,m.role FROM ws_members m JOIN ws_actors a ON a.id=m.actor WHERE m.space=? ORDER BY m.joined_at LIMIT 100",
        id,
      );
      return reply({
        space: {
          id,
          title: space.title,
          visibility: space.visibility,
          version: space.version,
          role: space.role,
        },
        messages: messages.reverse(),
        hasEarlier: messages.length === 80,
        artifacts: artifacts.map((a) => ({
          ...a,
          metadata: JSON.parse(a.metadata),
        })),
        jobs,
        members,
        capabilities,
      });
    }
    if (action === "join" && post) {
      if (space.visibility !== "shared") fail("此探索尚未开放加入。", 403);
      const inserted = await stmt(
        "INSERT OR IGNORE INTO ws_members(space,actor,role,joined_at) SELECT ?,?,'contributor',? WHERE EXISTS (SELECT 1 FROM ws_explorations WHERE id=? AND visibility='shared') RETURNING space",
        id,
        actor,
        now,
        id,
      ).all();
      if (
        !inserted.results.length &&
        !(await one(
          "SELECT role FROM ws_members WHERE space=? AND actor=?",
          id,
          actor,
        ))
      )
        fail("分享范围刚刚改变，无法加入。", 403);
      return reply({ joined: true });
    }
    if (action === "share" && post) {
      if (space.owner !== actor)
        fail("只有创建者可以修改探索的分享范围。", 403);
      const p = await payload(req);
      if (!["private", "shared"].includes(p.visibility))
        fail("请选择分享范围。");
      if (
        !Number.isSafeInteger(p.baseVersion) ||
        p.baseVersion !== space.version
      )
        fail("分享范围已更新，请重新载入。", 409);
      const changed = await stmt(
        "UPDATE ws_explorations SET visibility=?,version=version+1,updated_at=? WHERE id=? AND version=? RETURNING id",
        p.visibility,
        now,
        id,
        p.baseVersion,
      ).all();
      if (!changed.results.length) fail("探索已更新，请重新载入。", 409);
      return reply({ saved: true });
    }
    if (action === "messages" && post) {
      const p = await payload(req),
        body = str(p.body, "消息");
      return reply(
        await idempotent(p, async () => {
          const messageId = uid();
          return {
            response: { id: messageId },
            statements: [
              stmt(
                "INSERT INTO ws_messages(id,space,actor,body,client_id,digest,created_at) VALUES (?,?,?,?,?,?,?)",
                messageId,
                id,
                actor,
                body,
                p.requestId,
                await hash(body),
                now,
              ),
              touch(id),
            ],
          };
        }),
        201,
      );
    }
    if (action === "artifacts" && post) {
      const p = await payload(req),
        title = str(p.title, "成果名称", 160),
        body = str(p.body, "成果内容", 24000);
      if (!["markdown", "html"].includes(p.kind))
        fail("请选择笔记或交互页面。");
      let previous = null;
      if (p.artifactId) {
        previous = await one(
          "SELECT * FROM ws_artifacts WHERE id=? AND space=?",
          p.artifactId,
          id,
        );
        if (!previous) fail("成果不存在。", 404);
        if (p.baseVersion !== previous.version)
          fail("成果已经更新，先查看新版本再保存。", 409);
        if (p.kind !== previous.kind) fail("修改不能改变成果类型。");
      }
      if (
        p.sourceMessage &&
        !(await one(
          "SELECT id FROM ws_messages WHERE id=? AND space=?",
          p.sourceMessage,
          id,
        ))
      )
        fail("来源消息不在此探索中。");
      return reply(
        await idempotent(p, async () => {
          const aid = previous?.id || uid(),
            version = previous ? previous.version + 1 : 1;
          return {
            response: { id: aid, version },
            statements: [
              ...(previous
                ? [
                    stmt(
                      "UPDATE ws_artifacts SET title=?,version=? WHERE id=? AND version=?",
                      title,
                      version,
                      aid,
                      p.baseVersion,
                    ),
                  ]
                : [
                    stmt(
                      "INSERT INTO ws_artifacts(id,space,title,kind,version,created_at) VALUES (?,?,?,?,?,?)",
                      aid,
                      id,
                      title,
                      p.kind,
                      version,
                      now,
                    ),
                  ]),
              stmt(
                "INSERT INTO ws_artifact_versions(artifact,version,body,metadata,actor,source_message,job,created_at) VALUES (?,?,?,?,?,?,?,?)",
                aid,
                version,
                body,
                JSON.stringify({
                  origin: "human",
                  reason: str(p.reason || "创建成果", "修改说明", 2000),
                }),
                actor,
                p.sourceMessage || null,
                null,
                now,
              ),
              touch(id),
            ],
          };
        }),
        201,
      );
    }
    if (action === "jobs" && post) {
      const p = await payload(req);
      if (!["agent", "parallel", "causal", "docker"].includes(p.runner))
        fail("执行方式不存在。");
      if (p.runner === "docker" && !docker)
        fail("此服务尚未连接容器执行器。", 503);
      if (
        p.runner === "docker" &&
        (
          await one(
            "SELECT COUNT(*) AS count FROM ws_jobs WHERE actor=? AND runner='docker' AND status IN ('queued','running')",
            actor,
          )
        ).count >= 4
      )
        fail("已有实验正在等待或运行，完成后可以继续。", 429);
      const input = {};
      if (p.runner === "agent")
        input.prompt = str(p.input?.prompt, "给 Agent 的任务");
      if (p.runner === "parallel") {
        input.p = Number(p.input?.p);
        input.s = Number(p.input?.s);
        if (
          !Number.isFinite(input.p) ||
          input.p < 0 ||
          input.p > 1 ||
          !Number.isInteger(input.s) ||
          input.s < 1 ||
          input.s > 256
        )
          fail("并行比例为 0–1，执行者为 1–256。");
      }
      if (p.runner === "causal") {
        input.rain = Number(p.input?.rain);
        input.mode = p.input?.mode;
        if (
          !Number.isFinite(input.rain) ||
          input.rain <= 0 ||
          input.rain >= 1 ||
          !["observe", "intervene"].includes(input.mode)
        )
          fail("请输入正确的天气比例和比较方式。");
      }
      if (p.runner === "docker")
        input.code = str(p.input?.code, "Python 实验代码", 16000);
      const result = await idempotent(p, async () => {
        const jid = uid();
        return {
          response: {
            id: jid,
            status: p.runner === "agent" ? "waiting_provider" : "queued",
          },
          statements: [
            stmt(
              "INSERT INTO ws_jobs(id,space,actor,runner,input,status,attempt,created_at,updated_at) VALUES (?,?,?,?,?,?,0,?,?)",
              jid,
              id,
              actor,
              p.runner,
              JSON.stringify(input),
              p.runner === "agent" ? "waiting_provider" : "queued",
              now,
              now,
            ),
            touch(id),
          ],
        };
      });
      if (["parallel", "causal"].includes(p.runner))
        await runBuiltinJob(db, result.id);
      return reply(result, 201);
    }
    const jobAction = action.match(/^jobs\/([a-f0-9-]{36})\/(cancel|retry)$/);
    if (jobAction && post) {
      const job = await one(
        "SELECT * FROM ws_jobs WHERE id=? AND space=?",
        jobAction[1],
        id,
      );
      if (!job) fail("任务不存在。", 404);
      if (jobAction[2] === "cancel") {
        await run(
          "UPDATE ws_jobs SET status='cancelled',lease=NULL,lease_until=NULL,updated_at=? WHERE id=? AND status IN ('queued','running','waiting_provider')",
          now,
          job.id,
        );
        return reply({ saved: true });
      }
      if (job.runner === "docker" && !docker)
        fail("此服务尚未连接容器执行器。", 503);
      if (!["failed", "cancelled"].includes(job.status))
        fail("这个任务无需重试。", 409);
      const p = await payload(req);
      const result = await idempotent(p, async () => {
        const jid = uid();
        return {
          response: { id: jid },
          statements: [
            stmt(
              "INSERT INTO ws_jobs(id,space,actor,runner,input,status,attempt,created_at,updated_at) VALUES (?,?,?,?,?,?,0,?,?)",
              jid,
              id,
              actor,
              job.runner,
              JSON.stringify({ ...JSON.parse(job.input), retryOf: job.id }),
              job.runner === "agent" ? "waiting_provider" : "queued",
              now,
              now,
            ),
          ],
        };
      });
      if (["parallel", "causal"].includes(job.runner))
        await runBuiltinJob(db, result.id);
      return reply(result, 201);
    }
    const artifactAction = action.match(
      /^artifacts\/([a-f0-9-]{36})(?:\/(knowledge))?$/,
    );
    if (artifactAction) {
      const a = await one(
        "SELECT * FROM ws_artifacts WHERE id=? AND space=?",
        artifactAction[1],
        id,
      );
      if (!a) fail("成果不存在。", 404);
      if (!post)
        return reply({
          artifact: { id: a.id, title: a.title, kind: a.kind },
          versions: (
            await all(
              "SELECT version,body,metadata,created_at AS createdAt FROM ws_artifact_versions WHERE artifact=? ORDER BY version DESC",
              a.id,
            )
          ).map((v) => ({ ...v, metadata: JSON.parse(v.metadata) })),
        });
      if (artifactAction[2] === "knowledge") {
        const p = await payload(req);
        if (!Number.isSafeInteger(p.version)) fail("请选择成果版本。");
        const v = await one(
          "SELECT * FROM ws_artifact_versions WHERE artifact=? AND version=?",
          a.id,
          p.version,
        );
        if (!v) fail("成果版本不存在。", 404);
        if (a.kind !== "markdown")
          fail("先把实验发现整理为一份笔记，再沉淀为知识。");
        return reply(
          await idempotent(p, async () => {
            const did = uid();
            return {
              response: { id: did },
              statements: [
                stmt(
                  "INSERT INTO ws_documents(id,owner,title,visibility,status,version,source_artifact,source_version,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?,?,?)",
                  did,
                  actor,
                  a.title,
                  "private",
                  "draft",
                  a.id,
                  p.version,
                  now,
                  now,
                ),
                stmt(
                  "INSERT INTO ws_document_versions(document,version,title,body,metadata,reason,actor,created_at) VALUES (?,1,?,?,?,?,?,?)",
                  did,
                  a.title,
                  v.body,
                  JSON.stringify({
                    evidence: [],
                    limits: "尚待梳理",
                    reviews: [],
                  }),
                  "从选定成果版本整理；私人草稿",
                  actor,
                  now,
                ),
              ],
            };
          }),
          201,
        );
      }
    }
    if (action === "export" && !post) {
      const artifacts = await all(
        "SELECT a.id,a.title,a.kind,v.version,v.body,v.metadata,v.created_at FROM ws_artifacts a JOIN ws_artifact_versions v ON v.artifact=a.id WHERE a.space=? ORDER BY a.id,v.version",
        id,
      );
      return reply({
        format: "knowledge-atlas/exploration-1",
        exportedAt: now,
        space: { id, title: space.title, visibility: space.visibility },
        members: await all(
          "SELECT a.name,m.role FROM ws_members m JOIN ws_actors a ON a.id=m.actor WHERE m.space=?",
          id,
        ),
        messages: await all(
          "SELECT m.id,m.body,m.created_at,a.name FROM ws_messages m JOIN ws_actors a ON a.id=m.actor WHERE m.space=? ORDER BY m.rowid",
          id,
        ),
        artifacts,
        jobs: await all(
          "SELECT id,runner,input,status,attempt,error,artifact,created_at,updated_at FROM ws_jobs WHERE space=?",
          id,
        ),
      });
    }
  }
  if (route === "/knowledge" && !post) {
    return reply({
      documents: await all(
        "SELECT id,title,status,version,visibility,updated_at AS updatedAt FROM ws_documents WHERE visibility='shared' OR owner=? ORDER BY updated_at DESC LIMIT 100",
        actor,
      ),
    });
  }
  const dm = route.match(/^\/knowledge\/([a-f0-9-]{36})$/);
  if (dm) {
    const d = await docAccess(dm[1]);
    if (!post) {
      const versions = await all(
        "SELECT v.version,v.title,v.body,v.metadata,v.reason,v.created_at AS createdAt,a.name FROM ws_document_versions v JOIN ws_actors a ON a.id=v.actor WHERE document=? AND (v.visibility='shared' OR ?=?) ORDER BY version DESC",
        d.id,
        actor,
        d.owner,
      );
      const relationsByVersion = await all(
        "SELECT r.version,r.target,r.kind,r.reason FROM ws_relations r JOIN ws_document_versions v ON v.document=r.document AND v.version=r.version WHERE r.document=? AND (v.visibility='shared' OR ?=?) AND (r.target LIKE 'knowledge:%' OR EXISTS (SELECT 1 FROM ws_documents t WHERE 'document:'||t.id=r.target AND (t.visibility='shared' OR t.owner=?)))",
        d.id,
        actor,
        d.owner,
        actor,
      );
      const source = await one(
        "SELECT a.space,n.name FROM ws_artifacts a JOIN ws_artifact_versions v ON v.artifact=a.id AND v.version=? JOIN ws_actors n ON n.id=v.actor JOIN ws_explorations e ON e.id=a.space LEFT JOIN ws_members m ON m.space=e.id AND m.actor=? WHERE a.id=? AND (e.visibility='shared' OR m.actor IS NOT NULL)",
        d.source_version,
        actor,
        d.source_artifact,
      );
      const provenance = source
        ? {
            artifact: d.source_artifact,
            version: d.source_version,
            space: source.space,
            author: source.name,
          }
        : { note: "来源成果未对当前读者开放；此处只提供明确共享的知识内容。" };
      return reply({
        document: {
          id: d.id,
          title: d.title,
          version: d.version,
          status: d.status,
          visibility: d.visibility,
          mine: d.owner === actor,
        },
        versions: versions.map((v) => ({
          ...v,
          metadata: JSON.parse(v.metadata),
        })),
        relations: relationsByVersion.filter((r) => r.version === d.version),
        relationsByVersion,
        provenance,
      });
    }
    const p = await payload(req);
    if (p.baseVersion !== d.version)
      fail("正文已有更新，请先比较最新版本。", 409);
    const title = str(p.title, "知识标题", 160),
      body = str(p.body, "知识正文", 24000),
      reason = str(p.reason, "修改理由", 2000);
    if (
      !["private", "shared"].includes(p.visibility) ||
      !["draft", "maintained", "archived"].includes(p.status)
    )
      fail("知识状态无效。");
    if (
      d.owner !== actor &&
      (p.visibility !== d.visibility || p.status !== d.status)
    )
      fail("只有创建者可以修改知识的可见范围和生命周期。", 403);
    if (
      !Array.isArray(p.evidence || []) ||
      (p.evidence || []).some((s) => !s || typeof s !== "object")
    )
      fail("来源格式无效。");
    const evidence = (p.evidence || []).map((s) => ({
      label: str(s.label, "依据说明", 1500),
      url: s.url ? str(s.url, "来源地址", 2000) : "",
    }));
    if (evidence.length > 40) fail("单次来源过多。");
    for (const s of evidence)
      if (s.url && !/^https?:\/\//i.test(s.url))
        fail("来源需要 HTTP(S) 地址；证明、原始观察也可只填说明。");
    const limits = str(p.limits || "", "适用范围与未知", 4000, 0),
      review = str(p.review || "", "本次审阅说明", 4000, 0);
    if (p.status === "maintained" && (!evidence.length || !limits || !review))
      fail(
        "持续维护的正文需要依据、适用范围和具体审阅说明；未完成时可以保留为草稿。",
      );
    const relations = p.relations || [];
    if (!Array.isArray(relations) || relations.length > 30)
      fail("关系格式无效。");
    if (
      new Set(relations.map((r) => r?.target + "|" + r?.kind)).size !==
      relations.length
    )
      fail("存在重复的知识关系，请合并说明。");
    for (const r of relations) {
      if (!r || typeof r !== "object") fail("关系格式无效。");
      if (
        ![
          "prerequisite",
          "explains",
          "applies-to",
          "example-of",
          "contrasts-with",
          "challenges",
        ].includes(r.kind)
      )
        fail("未知关系类型。");
      str(r.reason, "关系理由", 1000);
      str(r.target, "关系目标", 100);
      if (r.target === `document:${d.id}`) fail("关系目标不能是自身。");
      if (r.target.startsWith("document:")) {
        const target = await docAccess(r.target.slice(9));
        if (p.visibility === "shared" && target.visibility !== "shared")
          fail("共享知识不能暴露私人知识的关联。");
      } else if (
        !Object.hasOwn(catalog, r.target) ||
        !r.target.startsWith("knowledge:")
      )
        fail("关联知识不存在。");
    }
    const result = await idempotent(p, async () => {
      const version = d.version + 1;
      return {
        response: { id: d.id, version },
        statements: [
          stmt(
            "INSERT INTO ws_document_versions(document,version,title,body,metadata,reason,actor,created_at,visibility) VALUES (?,?,?,?,?,?,?,?,?)",
            d.id,
            version,
            title,
            body,
            JSON.stringify({
              evidence,
              limits,
              reviews: review
                ? [{ kind: "human", name: me.name, result: review, at: now }]
                : [],
            }),
            reason,
            actor,
            now,
            p.visibility,
          ),
          stmt(
            "UPDATE ws_documents SET title=?,visibility=?,status=?,version=?,updated_at=? WHERE id=? AND version=?",
            title,
            p.visibility,
            p.status,
            version,
            now,
            d.id,
            d.version,
          ),
          ...relations.map((r) =>
            stmt(
              "INSERT INTO ws_relations(document,version,target,kind,reason) VALUES (?,?,?,?,?)",
              d.id,
              version,
              r.target,
              r.kind,
              r.reason,
            ),
          ),
        ],
      };
    });
    return reply(result, 201);
  }
  fail("工作区接口不存在。", 404);
}
