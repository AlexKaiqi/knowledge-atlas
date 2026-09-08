// Environment definitions are immutable file snapshots, not executed containers.
const encoder = new TextEncoder();
const uuid = /^[a-f0-9-]{36}$/;
const secretPart = /^(?:\.env(?:\..*)?|\.ssh|\.aws|\.azure|\.gnupg|\.kube|\.git|\.netrc|\.npmrc|\.pypirc|id_(?:rsa|dsa|ecdsa|ed25519)(?:\..*)?|credentials(?:\..*)?|secrets?(?:\..*)?)$/i;

export function validateEnvironmentFiles(files, fail) {
  if (!Array.isArray(files) || files.length < 1 || files.length > 20)
    fail("请提供 1–20 个文本文件。", 422);
  const seen = new Set();
  let bytes = 0;
  return files.map((file) => {
    const p = file?.path;
    if (typeof p !== "string" || !p.length || p.length > 160 ||
        /[\\:%\x00-\x1f\x7f]/.test(p) || p.startsWith("/") || p.startsWith("~"))
      fail("文件路径需要是 1–160 个字符的相对路径。", 422);
    const parts = p.split("/");
    if (parts.some((part) => !part || part === "." || part === ".." ||
        part !== part.trim() || part.endsWith(".") || secretPart.test(part) ||
        /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) ||
        /\.(?:pem|key|p12|pfx|keystore)$/i.test(p) || /(?:^|\/)\.docker\/config\.json$/i.test(p))
      fail("路径不能穿越目录或包含密钥、凭据等敏感文件。", 422);
    const key = p.normalize("NFC").toLowerCase();
    if ([...seen].some((prior) => prior === key || prior.startsWith(key + "/") || key.startsWith(prior + "/")))
      fail("文件路径不能重复，文件与目录也不能重名。", 422);
    seen.add(key);
    if (typeof file.content !== "string" || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(file.content))
      fail("文件内容必须是文本。", 422);
    if (/-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/.test(file.content))
      fail("请移除私钥，再保存环境定义。", 422);
    bytes += encoder.encode(file.content).byteLength;
    if (bytes > 28000) fail("文件内容合计不能超过 28,000 字节。", 422);
    return { path: p, content: file.content };
  });
}

// Copies explicitly public at the time of use remain independent. A private
// snapshot needs an explicit publication of that exact source version first.
export const environmentShareGuard = `NOT EXISTS (
  SELECT 1 FROM ws_artifact_versions av JOIN ws_artifacts a ON a.id=av.artifact
  WHERE a.space=? AND json_extract(av.metadata,'$.origin')='environment'
    AND COALESCE(json_extract(av.metadata,'$.environmentVisibility'),'private')!='shared'
    AND NOT EXISTS (
      SELECT 1 FROM ws_environments e JOIN ws_environment_versions v ON v.environment=e.id
      WHERE e.id=json_extract(av.metadata,'$.environment')
        AND v.version=json_extract(av.metadata,'$.environmentVersion')
        AND e.visibility='shared' AND v.shared_at IS NOT NULL
    )
)`;

export async function environments(req, {
  actor, now, one, all, stmt, idempotent, access, touch, reply, payload, fail, str, uid,
}) {
  const url = new URL(req.url);
  const route = url.pathname.slice("/api/workspace/environments".length);
  const post = req.method === "POST";
  const positive = (v) => {
    if (!Number.isSafeInteger(v) || v < 1) fail("请选择有效的环境版本。", 422);
    return v;
  };
  const visibility = (v) => {
    if (!["private", "shared"].includes(v)) fail("请选择分享范围。", 422);
    return v;
  };
  const readable = `(e.owner=? OR (e.visibility='shared' AND v.shared_at IS NOT NULL))`;
  async function load(id, version) {
    const e = await one(
      `SELECT e.*,CASE WHEN e.owner=? THEN 'owner' WHEN m.actor IS NOT NULL THEN 'member' ELSE NULL END AS role
       FROM ws_environments e LEFT JOIN ws_environment_members m ON m.environment=e.id AND m.actor=?
       WHERE e.id=? AND (e.owner=? OR e.visibility='shared')`, actor, actor, id, actor,
    );
    if (!e) fail("环境不存在，或你没有访问权限。", 404);
    const selected = await one(
      `SELECT v.version,v.purpose,v.files,v.reason,v.shared_at AS sharedAt,v.created_at AS createdAt,a.name
       FROM ws_environment_versions v JOIN ws_environments e ON e.id=v.environment JOIN ws_actors a ON a.id=v.actor
       WHERE e.id=? AND v.version=? AND ${readable}`, id, version ?? e.version, actor,
    );
    if (!selected) fail("环境版本不存在，或你没有访问权限。", 404);
    selected.files = JSON.parse(selected.files);
    return { e, selected };
  }
  const summary = (e, source = null) => ({
    id: e.id, title: e.title, visibility: e.visibility, version: e.version,
    role: e.role, source, createdAt: e.created_at, updatedAt: e.updated_at,
  });

  if (!route && !post) return reply({ environments: await all(
    `SELECT e.id,e.title,v.purpose,e.visibility,e.version,e.updated_at AS updatedAt,
      CASE WHEN e.owner=? THEN 'owner' WHEN m.actor IS NOT NULL THEN 'member' ELSE NULL END AS role
     FROM ws_environments e JOIN ws_environment_versions v ON v.environment=e.id AND v.version=e.version
     LEFT JOIN ws_environment_members m ON m.environment=e.id AND m.actor=?
     WHERE ${readable} ORDER BY e.updated_at DESC,e.id LIMIT 100`, actor, actor, actor,
  ) });

  if (!route && post) {
    const p = await payload(req);
    let source = null;
    if (p.sourceEnvironment !== undefined) {
      if (typeof p.sourceEnvironment !== "string" || !uuid.test(p.sourceEnvironment))
        fail("来源环境标识无效。", 422);
      source = await load(p.sourceEnvironment, positive(p.sourceVersion));
    } else if (p.sourceVersion !== undefined) fail("请选择来源环境。", 422);
    const title = str(p.title ?? (source ? `${source.e.title} · 副本`.slice(0, 120) : undefined), "环境名称", 120);
    const purpose = str(p.purpose ?? source?.selected.purpose, "环境用途", 8000);
    const files = validateEnvironmentFiles(p.files === undefined ? source?.selected.files : p.files, fail);
    const shared = visibility(p.visibility === undefined ? "private" : p.visibility);
    const reason = str(p.reason ?? (source ? "派生所选环境版本" : "创建环境定义"), "修改说明", 2000);
    return reply(await idempotent(p, async () => {
      const id = uid();
      const guardedTitle = source
        ? `(SELECT ? FROM ws_environments e JOIN ws_environment_versions v ON v.environment=e.id WHERE e.id=? AND v.version=? AND ${readable})`
        : "?";
      return {
        response: { id, version: 1 },
        statements: [
          stmt(`INSERT INTO ws_environments(id,owner,title,visibility,version,source_environment,source_version,created_at,updated_at)
            VALUES (?,?,${guardedTitle},?,1,?,?,?,?)`, id, actor, title,
            ...(source ? [source.e.id, source.selected.version, actor] : []), shared,
            source?.e.id ?? null, source?.selected.version ?? null, now, now),
          stmt("INSERT INTO ws_environment_versions(environment,version,purpose,files,reason,actor,shared_at,created_at) VALUES (?,1,?,?,?,?,?,?)",
            id, purpose, JSON.stringify(files), reason, actor, shared === "shared" ? now : null, now),
        ],
      };
    }), 201);
  }

  const match = route.match(/^\/([a-f0-9-]{36})(?:\/(join|versions|share|use))?$/);
  if (!match) fail("环境接口不存在。", 404);
  const [, id, action = ""] = match;
  if (!post) {
    if (action) fail("环境接口不存在。", 404);
    const version = url.searchParams.has("version") ? positive(Number(url.searchParams.get("version"))) : undefined;
    const { e, selected } = await load(id, version);
    const history = await all(
      `SELECT v.version,v.purpose,v.reason,v.shared_at AS sharedAt,v.created_at AS createdAt,a.name
       FROM ws_environment_versions v JOIN ws_environments e ON e.id=v.environment JOIN ws_actors a ON a.id=v.actor
       WHERE e.id=? AND ${readable} ORDER BY v.version DESC`, id, actor,
    );
    const provenance = e.source_environment && await one(
      `SELECT e.id,v.version FROM ws_environments e JOIN ws_environment_versions v ON v.environment=e.id
       WHERE e.id=? AND v.version=? AND ${readable}`, e.source_environment, e.source_version, actor,
    );
    return reply({ environment: summary(e, provenance || null), selected, versions: history });
  }

  const p = await payload(req);
  const { e, selected } = await load(id, action === "use" ? positive(p.version) : undefined);
  if (action === "join") {
    if (e.visibility !== "shared") fail("此环境尚未开放参与。", 403);
    return reply(await idempotent(p, async () => ({
      response: { joined: true },
      statements: [stmt(`INSERT INTO ws_environment_members(environment,actor,joined_at)
        VALUES ((SELECT id FROM ws_environments WHERE id=? AND visibility='shared'),?,?)
        ON CONFLICT(environment,actor) DO NOTHING`, id, actor, now)],
    })), 201);
  }

  if (action === "versions") {
    if (e.role !== "owner" && !(e.role === "member" && e.visibility === "shared"))
      fail("先加入这个共享环境，再参与修改。", 403);
    if (positive(p.baseVersion) !== e.version) fail("环境已更新，请重新载入并比较版本。", 409);
    const title = str(p.title ?? e.title, "环境名称", 120);
    const purpose = str(p.purpose, "环境用途", 8000);
    const files = validateEnvironmentFiles(p.files, fail);
    const reason = str(p.reason, "修改说明", 2000);
    return reply(await idempotent(p, async () => ({
      response: { id, version: e.version + 1 },
      statements: [
        // The guarded NOT NULL purpose rechecks the CAS and membership inside the
        // transaction; a lost race aborts the entire batch, including replay data.
        stmt(`INSERT INTO ws_environment_versions(environment,version,purpose,files,reason,actor,shared_at,created_at)
          VALUES (?,?,(SELECT ? FROM ws_environments e WHERE e.id=? AND e.version=? AND
            (e.owner=? OR (e.visibility='shared' AND EXISTS (SELECT 1 FROM ws_environment_members m WHERE m.environment=e.id AND m.actor=?)))),?,?,?,
            (SELECT CASE WHEN visibility='shared' THEN ? ELSE NULL END FROM ws_environments WHERE id=?),?)`,
          id, e.version + 1, purpose, id, p.baseVersion, actor, actor, JSON.stringify(files), reason, actor, now, id, now),
        stmt("UPDATE ws_environments SET title=?,version=version+1,updated_at=? WHERE id=? AND version=?", title, now, id, p.baseVersion),
      ],
    })), 201);
  }

  if (action === "share") {
    if (e.role !== "owner") fail("只有创建者可以修改环境分享范围。", 403);
    if (positive(p.baseVersion) !== e.version) fail("环境已更新，请重新载入再分享。", 409);
    const shared = visibility(p.visibility);
    const publishedVersion = p.version === undefined ? e.version : positive(p.version);
    if (publishedVersion !== e.version && (shared !== "shared" || e.visibility !== "shared"))
      fail("请先分享当前环境，再明确分享所选历史版本；历史版本不能用于撤回整体分享。", 403);
    if (!(await one("SELECT version FROM ws_environment_versions WHERE environment=? AND version=?", id, publishedVersion)))
      fail("环境版本不存在。", 404);
    return reply(await idempotent(p, async () => ({
      response: { id, version: e.version, visibility: shared, ...(shared === "shared" && p.version !== undefined ? { publishedVersion } : {}) },
      statements: [
        stmt(`UPDATE ws_environments SET visibility=CASE WHEN version=? AND visibility=? AND owner=? THEN ? ELSE NULL END,updated_at=? WHERE id=?`,
          p.baseVersion, e.visibility, actor, shared, now, id),
        ...(shared === "shared" ? [stmt("UPDATE ws_environment_versions SET shared_at=COALESCE(shared_at,?) WHERE environment=? AND version=?", now, id, publishedVersion)] : []),
      ],
    })), 201);
  }

  if (action === "use") {
    if (typeof p.spaceId !== "string" || !uuid.test(p.spaceId)) fail("请选择要使用环境的探索。", 422);
    const space = await access(p.spaceId, true);
    const publicVersion = e.visibility === "shared" && selected.sharedAt !== null;
    if (!publicVersion && space.visibility === "shared")
      fail("先明确分享这个环境版本，再将其放入共同探索。", 403);
    const metadata = {
      origin: "environment", environment: id, environmentVersion: selected.version,
      environmentVisibility: publicVersion ? "shared" : "private",
      environmentSharedAt: selected.sharedAt, files: selected.files, purpose: selected.purpose,
      reason: "冻结所选环境定义；尚未构建或执行",
    };
    const title = `${e.title} · v${selected.version}`;
    const escape = (text) => text.replace(/[\\`*_{}\[\]()#+.!<>]/g, "\\$&");
    const body = `## ${escape(title)}\n\n${selected.purpose}\n\n### 冻结文件\n\n${selected.files.map((file) => `- ${escape(file.path)}`).join("\n")}\n\n这是待构建的环境定义，尚未构建或执行。此处复制所选版本的文件；来源后续修改或撤回分享不会替换或收回已有副本。\n`;
    return reply(await idempotent(p, async () => {
      const aid = uid();
      return {
        response: { id: aid, version: 1, spaceId: space.id, environment: id, environmentVersion: selected.version },
        statements: [
          stmt(`INSERT INTO ws_artifacts(id,space,title,kind,version,created_at) VALUES (?,?,
            (SELECT ? FROM ws_environments e JOIN ws_environment_versions v ON v.environment=e.id
             JOIN ws_explorations s ON s.id=? JOIN ws_members m ON m.space=s.id AND m.actor=?
             WHERE e.id=? AND v.version=? AND ${readable} AND e.visibility=?
             AND (s.visibility='private' OR (e.visibility='shared' AND v.shared_at IS NOT NULL))), 'markdown',1,?)`,
            aid, space.id, title, space.id, actor, id, selected.version, actor, e.visibility, now),
          stmt("INSERT INTO ws_artifact_versions(artifact,version,body,metadata,actor,source_message,job,created_at) VALUES (?,1,?,?,?,NULL,NULL,?)",
            aid, body, JSON.stringify(metadata), actor, now),
          touch(space.id),
        ],
      };
    }), 201);
  }
  fail("环境接口不存在。", 404);
}
