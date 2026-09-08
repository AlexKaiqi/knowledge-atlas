const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
function string(value, name, min = 1, max = 12000) {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.length > max
  )
    throw new ApiError(`${name}需要 ${min}–${max} 个字符。`);
  return value.trim();
}
async function payload(req) {
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength > 48000)
    throw new ApiError("内容太长，请缩短后重试。", 413);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError("无法读取提交内容。");
  }
}
export function createApi({ catalog }) {
  return async function handle(req, db) {
    const url = new URL(req.url);
    const pathname = url.pathname;
    let cookie = "";
    try {
      if (!db)
        return json(
          {
            error:
              "共享服务未连接。当前可以阅读与运行实验，请连接服务后保存或发布。",
          },
          503,
        );
      if (!["GET", "POST"].includes(req.method))
        return json({ error: "不支持的操作" }, 405, { allow: "GET, POST" });
      if (req.method === "POST") {
        const origin = req.headers.get("origin");
        if (
          (origin && origin !== url.origin) ||
          req.headers.get("sec-fetch-site") === "cross-site"
        )
          throw new ApiError("请从本站提交内容。", 403);
        if (!req.headers.get("content-type")?.startsWith("application/json"))
          throw new ApiError("需要 JSON 内容。", 415);
        if (Number(req.headers.get("content-length")) > 48000)
          throw new ApiError("内容太长。", 413);
      }
      let token = req.headers
        .get("cookie")
        ?.match(/(?:^|;\s*)atlas_session=([a-f0-9]{64})(?:;|$)/)?.[1];
      if (!token) {
        token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) =>
          x.toString(16).padStart(2, "0"),
        ).join("");
        cookie = `atlas_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${url.protocol === "https:" ? "; Secure" : ""}`;
      }
      const owner = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(token),
          ),
        ),
        (x) => x.toString(16).padStart(2, "0"),
      ).join("");
      const reply = (data, status = 200) =>
        json(data, status, cookie ? { "set-cookie": cookie } : {});
      const all = async (sql, ...args) =>
        (
          await db
            .prepare(sql)
            .bind(...args)
            .all()
        ).results;
      const one = async (sql, ...args) =>
        db
          .prepare(sql)
          .bind(...args)
          .first();
      const run = async (sql, ...args) =>
        db
          .prepare(sql)
          .bind(...args)
          .run();
      const validTarget = (target, { knowledgeOnly = false } = {}) => {
        if (target === "general" && !knowledgeOnly) return target;
        if (
          typeof target !== "string" ||
          !Object.hasOwn(catalog, target) ||
          (knowledgeOnly && !target.startsWith("knowledge:"))
        )
          throw new ApiError("关联内容不存在，请重新选择。");
        return target;
      };
      if (pathname === "/api/session" && req.method === "GET")
        return reply({
          mode: "anonymous",
          storage: "server",
          message:
            "私人档案与此浏览器的访问凭据关联；清除 Cookie 后请用导出文件保留记录。",
        });
      if (pathname === "/api/notes" && req.method === "GET") {
        const records = await all(
          "SELECT target,title,body,data,stage,review_at AS reviewAt,updated_at AS updatedAt FROM notes WHERE owner = ? ORDER BY updated_at DESC",
          owner,
        );
        const observations = await all(
          "SELECT id,target,title,body,data,recorded_at AS updatedAt FROM observations WHERE owner = ? ORDER BY recorded_at DESC",
          owner,
        );
        return reply({
          notes: [
            ...records,
            ...observations.map((n) => ({
              ...n,
              stage: "saved",
              reviewAt: null,
            })),
          ]
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((n) => ({ ...n, data: JSON.parse(n.data) })),
        });
      }
      if (pathname === "/api/notes" && req.method === "POST") {
        const p = await payload(req);
        const target = validTarget(p.target);
        if (!target.startsWith("question:") && !target.startsWith("practice:"))
          throw new ApiError("学习记录必须关联问题或实践。");
        const title = string(p.title, "标题", 1, 200);
        const body = string(p.body ?? "", "笔记", 0, 16000);
        const data = JSON.stringify(p.data ?? {});
        if (data.length > 20000) throw new ApiError("学习记录太长。");
        if (!["started", "explored", "reviewed", "saved"].includes(p.stage))
          throw new ApiError("学习状态无效。");
        if (
          p.reviewAt != null &&
          (!Number.isSafeInteger(p.reviewAt) ||
            p.reviewAt < 0 ||
            p.reviewAt > Date.now() + 5 * 366 * 86400000)
        )
          throw new ApiError("复习时间无效。");
        if (target.startsWith("practice:")) {
          const id = crypto.randomUUID();
          const now = Date.now();
          await run(
            "INSERT INTO observations (id,owner,target,title,body,data,recorded_at) VALUES (?,?,?,?,?,?,?)",
            id,
            owner,
            target,
            title,
            body,
            data,
            now,
          );
          return reply({ saved: true, id, updatedAt: now }, 201);
        }
        const now = Date.now();
        await run(
          "INSERT INTO notes (owner,target,title,body,data,stage,review_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(owner,target) DO UPDATE SET title=excluded.title,body=excluded.body,data=excluded.data,stage=excluded.stage,review_at=excluded.review_at,updated_at=excluded.updated_at",
          owner,
          target,
          title,
          body,
          data,
          p.stage,
          p.reviewAt ?? null,
          now,
        );
        return reply({ saved: true, updatedAt: now });
      }
      if (pathname === "/api/discussions" && req.method === "GET") {
        const target = url.searchParams.get("target");
        if (target) validTarget(target);
        const roots = await all(
          `SELECT id,target,kind,title,body,nickname,parent,created_at AS createdAt,(SELECT COUNT(*) FROM discussions r WHERE r.parent=d.id) AS replyCount FROM discussions d WHERE parent IS NULL ${target ? "AND target = ?" : ""} ORDER BY created_at DESC LIMIT 100`,
          ...(target ? [target] : []),
        );
        const replies = roots.length
          ? await all(
              `SELECT id,target,kind,title,body,nickname,parent,created_at AS createdAt FROM discussions WHERE parent IN (${roots.map(() => "?").join(",")}) ORDER BY created_at DESC LIMIT 2000`,
              ...roots.map((r) => r.id),
            )
          : [];
        return reply({ discussions: [...roots, ...replies], limit: 100 });
      }
      if (pathname === "/api/discussions" && req.method === "POST") {
        const p = await payload(req);
        const target = validTarget(p.target);
        const body = string(p.body, "正文", 2, 12000);
        const nickname = string(p.nickname || "好奇的访客", "称呼", 1, 40);
        const kind = p.kind;
        if (!["question", "idea", "evidence", "experiment"].includes(kind))
          throw new ApiError("请选择贡献类型。");
        let parent = null;
        let title = string(p.title || "回复", "标题", 1, 160);
        if (p.parent) {
          const original = await one(
            "SELECT id,target,parent FROM discussions WHERE id = ?",
            p.parent,
          );
          if (!original || original.target !== target || original.parent)
            throw new ApiError("回复的主题不存在或不匹配。");
          parent = original.id;
        }
        const recent = await one(
          "SELECT COUNT(*) AS count FROM discussions WHERE owner = ? AND created_at > ?",
          owner,
          Date.now() - 60000,
        );
        if (recent.count >= 10)
          throw new ApiError("这一分钟提交较多，请稍后继续。", 429);
        const id = crypto.randomUUID();
        const now = Date.now();
        await run(
          "INSERT INTO discussions (id,target,kind,title,body,nickname,owner,parent,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
          id,
          target,
          kind,
          title,
          body,
          nickname,
          owner,
          parent,
          now,
        );
        return reply({ id, createdAt: now }, 201);
      }
      if (pathname === "/api/revisions" && req.method === "GET") {
        const target = url.searchParams.get("target");
        if (target) validTarget(target, { knowledgeOnly: true });
        const revisions = await all(
          `SELECT id,target,base_version AS baseVersion,field,before_text AS beforeText,after_text AS afterText,reason,sources,nickname,status,created_at AS createdAt FROM revisions ${target ? "WHERE target = ?" : ""} ORDER BY created_at DESC LIMIT 100`,
          ...(target ? [target] : []),
        );
        return reply({
          revisions: revisions.map((r) => ({
            ...r,
            status: catalog[r.target]?.revisionHistory?.some(
              (h) => h.id === r.id,
            )
              ? "merged"
              : r.status,
          })),
        });
      }
      if (pathname === "/api/revisions" && req.method === "POST") {
        const p = await payload(req);
        const target = validTarget(p.target, { knowledgeOnly: true });
        const base = catalog[target];
        if (p.baseVersion !== base.version)
          throw new ApiError("原文版本已变化，请重新加载后比较。", 409);
        if (
          !["summary", "statement", "intuition", "example", "check"].includes(
            p.field,
          )
        )
          throw new ApiError("该字段暂不支持在线提案。");
        if (p.beforeText !== base[p.field])
          throw new ApiError("原文内容已改变，请重新加载后比较。", 409);
        const after = string(p.afterText, "修订内容", 4, 10000);
        if (after === base[p.field]) throw new ApiError("内容与原文相同。");
        const reason = string(p.reason, "修改理由", 4, 3000);
        const sources = string(p.sources, "来源或证据说明", 4, 4000);
        const nickname = string(p.nickname || "好奇的访客", "称呼", 1, 40);
        const recent = await one(
          "SELECT COUNT(*) AS count FROM revisions WHERE owner = ? AND created_at > ?",
          owner,
          Date.now() - 60000,
        );
        if (recent.count >= 5)
          throw new ApiError("这一分钟提案较多，请稍后继续。", 429);
        const id = crypto.randomUUID();
        await run(
          "INSERT INTO revisions (id,target,base_version,field,before_text,after_text,reason,sources,nickname,owner,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
          id,
          target,
          base.version,
          p.field,
          base[p.field],
          after,
          reason,
          sources,
          nickname,
          owner,
          "proposed",
          Date.now(),
        );
        return reply({ id, status: "proposed" }, 201);
      }
      return reply({ error: "接口不存在。" }, 404);
    } catch (error) {
      if (error instanceof ApiError)
        return json({ error: error.message }, error.status);
      console.error("API operation failed:", error.name);
      return json({ error: "保存服务暂时不可用，请保留输入并稍后重试。" }, 500);
    }
  };
}
