import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApi } from "../server/api.mjs";
import { openLocalDatabase } from "../server/local-db.mjs";
import { validateEnvironmentFiles } from "../server/environments.mjs";

const migrations = new URL("../drizzle", import.meta.url).pathname;
const request = (body) => ({ ...body, requestId: crypto.randomUUID() });
const files = (content = "print('hello')\n") => [
  { path: "Dockerfile", content: "FROM python:3.13-alpine\nWORKDIR /workspace\n" },
  { path: "src/main.py", content },
];
const definition = (extra = {}) => ({ title: "一起实验", purpose: "验证一个可重复的小问题", files: files(), ...extra });

async function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-environments-test-"));
  const db = openLocalDatabase(path.join(dir, "db.sqlite"), migrations);
  const api = createApi({ catalog: {} });
  let a;
  async function call(route, body, cookie = a) {
    const response = await api(new Request("http://localhost/api/workspace" + route, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        cookie: cookie || "",
        ...(body === undefined ? {} : { "content-type": "application/json", origin: "http://localhost" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), db);
    return { status: response.status, data: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
  }
  a = (await call("/session")).cookie;
  const b = (await call("/session", undefined, "")).cookie;
  const c = (await call("/session", undefined, "")).cookie;
  return {
    db, call, a, b, c,
    async count(table) { return (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).bind().first()).n; },
    beforeBatch(run) {
      const original = db.batch.bind(db);
      db.batch = async (statements) => { db.batch = original; await run(); return original(statements); };
    },
    cleanup() { db.close(); fs.rmSync(dir, { recursive: true, force: true }); },
  };
}

test("environment publication exposes selected revisions, joining does not grant private-history access", async () => {
  const x = await setup();
  try {
    const created = await x.call("/environments", request(definition({ purpose: "PRIVATE-FIRST-DRAFT", files: files("PRIVATE-CODE") })));
    assert.equal(created.status, 201);
    const id = created.data.id;
    assert.equal((await x.call(`/environments/${id}`)).data.environment.visibility, "private");
    assert.equal((await x.call(`/environments/${id}`, undefined, x.b)).status, 404);
    assert.equal((await x.call(`/environments/${id}/join`, request({}), x.b)).status, 404);
    assert.deepEqual((await x.call("/environments", undefined, x.b)).data.environments, []);
    const edit = request({ baseVersion: 1, purpose: "公开可复现的版本", files: files("public-v2"), reason: "移除私人草稿" });
    assert.equal((await x.call(`/environments/${id}/versions`, edit)).status, 201);
    const share = request({ baseVersion: 2, visibility: "shared" });
    assert.equal((await x.call(`/environments/${id}/share`, share)).status, 201);
    const listing = (await x.call("/environments", undefined, x.b)).data.environments;
    assert.equal(listing.length, 1);
    assert.equal(listing[0].role, null);
    const visible = (await x.call(`/environments/${id}`, undefined, x.b)).data;
    assert.equal(visible.environment.version, 2);
    assert.deepEqual(visible.versions.map((v) => v.version), [2]);
    assert.ok(!JSON.stringify(visible).includes("PRIVATE"));
    assert.equal((await x.call(`/environments/${id}?version=1`, undefined, x.b)).status, 404);
    assert.equal((await x.call(`/environments/${id}?version=1`)).data.selected.files[1].content, "PRIVATE-CODE");
    const next = { baseVersion: 2, purpose: "参与者补充", files: files("member-v3"), reason: "增加实验条件" };
    assert.equal((await x.call(`/environments/${id}/versions`, request(next), x.b)).status, 403);
    const join = request({});
    assert.equal((await x.call(`/environments/${id}/join`, join, x.b)).status, 201);
    assert.equal((await x.call(`/environments/${id}/join`, join, x.b)).status, 201);
    assert.equal(await x.count("ws_environment_members"), 1);
    assert.equal((await x.call(`/environments/${id}`, undefined, x.b)).data.environment.role, "member");
    assert.equal((await x.call(`/environments/${id}/versions`, request(next), x.b)).status, 201);
    assert.equal((await x.call(`/environments/${id}/share`, request({ baseVersion: 3, visibility: "private" }), x.b)).status, 403);
    assert.deepEqual((await x.call(`/environments/${id}`, undefined, x.b)).data.versions.map((v) => v.version), [3, 2]);
    assert.equal((await x.call(`/environments/${id}/share`, request({ baseVersion: 3, visibility: "private" }))).status, 201);
    assert.equal((await x.call(`/environments/${id}`, undefined, x.b)).status, 404);
    assert.equal((await x.call(`/environments/${id}?version=2`, undefined, x.b)).status, 404);
    assert.equal((await x.call(`/environments/${id}/versions`, request({ ...next, baseVersion: 3 }), x.b)).status, 404);
    assert.deepEqual((await x.call("/environments", undefined, x.b)).data.environments, []);
    assert.equal((await x.call(`/environments/${id}`)).data.environment.role, "owner");
    assert.deepEqual((await x.call(`/environments/${id}`)).data.versions.map((v) => v.version), [3, 2, 1]);
  } finally { x.cleanup(); }
});

test("environment edits use CAS; replays neither duplicate versions nor undo later withdrawal", async () => {
  const x = await setup();
  try {
    const create = request(definition({ visibility: "shared" }));
    const made = await x.call("/environments", create);
    const id = made.data.id;
    assert.deepEqual((await x.call("/environments", create)).data, made.data);
    assert.equal((await x.call("/environments", { ...create, visibility: "private" })).status, 409);
    const edits = ["one", "two"].map((content) => request({ baseVersion: 1, purpose: "比较并发修改", files: files(content), reason: content }));
    const results = await Promise.all(edits.map((p) => x.call(`/environments/${id}/versions`, p)));
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    const winner = results.findIndex((r) => r.status === 201);
    assert.deepEqual((await x.call(`/environments/${id}/versions`, edits[winner])).data, results[winner].data);
    assert.equal(await x.count("ws_environment_versions"), 2);
    const share = request({ baseVersion: 2, visibility: "shared" });
    await x.call(`/environments/${id}/share`, share);
    await x.call(`/environments/${id}/share`, request({ baseVersion: 2, visibility: "private" }));
    assert.equal((await x.call(`/environments/${id}/share`, share)).data.visibility, "shared");
    assert.equal((await x.call(`/environments/${id}`)).data.environment.visibility, "private");
    assert.equal((await x.call(`/environments/${id}`, undefined, x.b)).status, 404);
  } finally { x.cleanup(); }
});

test("withdrawal during an accepted member edit or fork is checked again inside the transaction", async () => {
  const x = await setup();
  try {
    const id = (await x.call("/environments", request(definition({ visibility: "shared" })))).data.id;
    await x.call(`/environments/${id}/join`, request({}), x.b);
    x.beforeBatch(() => x.call(`/environments/${id}/share`, request({ baseVersion: 1, visibility: "private" })));
    const blocked = await x.call(`/environments/${id}/versions`, request({ baseVersion: 1, purpose: "旧页面的编辑", files: files("must-not-save"), reason: "旧页面" }), x.b);
    assert.equal(blocked.status, 409);
    assert.equal(await x.count("ws_environment_versions"), 1);
    await x.call(`/environments/${id}/share`, request({ baseVersion: 1, visibility: "shared" }));
    x.beforeBatch(() => x.call(`/environments/${id}/share`, request({ baseVersion: 1, visibility: "private" })));
    assert.equal((await x.call("/environments", request({ sourceEnvironment: id, sourceVersion: 1 }), x.b)).status, 409);
    assert.equal(await x.count("ws_environments"), 1);
  } finally { x.cleanup(); }
});

test("forks copy an accessible version and keep their files after source withdrawal without exposing private provenance", async () => {
  const x = await setup();
  try {
    const source = (await x.call("/environments", request(definition({ files: files("private-selected") })))).data.id;
    assert.equal((await x.call("/environments", request({ sourceEnvironment: source, sourceVersion: 1 }), x.b)).status, 404);
    const publicFork = (await x.call("/environments", request({ sourceEnvironment: source, sourceVersion: 1, visibility: "shared" }))).data.id;
    const visible = (await x.call(`/environments/${publicFork}`, undefined, x.b)).data;
    assert.equal(visible.environment.source, null);
    assert.deepEqual(visible.selected.files, files("private-selected"));
    assert.deepEqual((await x.call(`/environments/${publicFork}`)).data.environment.source, { id: source, version: 1 });
    const p = request({ sourceEnvironment: publicFork, sourceVersion: 1 });
    const fork = await x.call("/environments", p, x.b);
    assert.equal(fork.status, 201);
    assert.deepEqual((await x.call("/environments", p, x.b)).data, fork.data);
    await x.call(`/environments/${publicFork}/share`, request({ baseVersion: 1, visibility: "private" }));
    const kept = (await x.call(`/environments/${fork.data.id}`, undefined, x.b)).data;
    assert.equal(kept.environment.visibility, "private");
    assert.equal(kept.environment.source, null);
    assert.deepEqual(kept.selected.files, files("private-selected"));
    assert.equal((await x.call(`/environments/${fork.data.id}`)).status, 404);
    assert.equal((await x.call("/environments", request({ sourceEnvironment: publicFork, sourceVersion: 1, files: null }))).status, 422);
  } finally { x.cleanup(); }
});

test("use freezes the selected files, requires target write access and preserves copies after withdrawal", async () => {
  const x = await setup();
  try {
    const id = (await x.call("/environments", request(definition({ visibility: "shared", files: files("frozen-v1") })))).data.id;
    await x.call(`/environments/${id}/versions`, request({ baseVersion: 1, purpose: "最新版本", files: files("current-v2"), reason: "继续实验" }));
    const spaceId = (await x.call("/spaces", request({ body: "共同探索", visibility: "shared" }))).data.id;
    const p = request({ version: 1, spaceId });
    assert.equal((await x.call(`/environments/${id}/use`, p, x.b)).status, 403);
    await x.call(`/spaces/${spaceId}/join`, {}, x.b);
    const used = await x.call(`/environments/${id}/use`, p, x.b);
    assert.equal(used.status, 201);
    assert.deepEqual((await x.call(`/environments/${id}/use`, p, x.b)).data, used.data);
    const artifact = (await x.call(`/spaces/${spaceId}`, undefined, x.b)).data.artifacts[0];
    assert.equal(artifact.kind, "markdown");
    assert.equal(artifact.metadata.origin, "environment");
    assert.equal(artifact.metadata.environmentVersion, 1);
    assert.equal(artifact.metadata.environmentVisibility, "shared");
    assert.deepEqual(artifact.metadata.files, files("frozen-v1"));
    assert.match(artifact.body, /尚未构建或执行/);
    await x.call(`/environments/${id}/share`, request({ baseVersion: 2, visibility: "private" }));
    assert.equal((await x.call(`/environments/${id}`, undefined, x.b)).status, 404);
    assert.deepEqual((await x.call(`/spaces/${spaceId}`, undefined, x.b)).data.artifacts[0].metadata.files, files("frozen-v1"));
    assert.equal((await x.call(`/environments/${id}/use`, request({ version: 1, spaceId }))).status, 403);
    assert.equal(await x.count("ws_artifacts"), 1);
  } finally { x.cleanup(); }
});

test("private snapshots cannot leak via a shared target or later exploration sharing, including artifact history", async () => {
  const x = await setup();
  try {
    const id = (await x.call("/environments", request(definition({ files: files("private-v1") })))).data.id;
    const shared = (await x.call("/spaces", request({ body: "公共目标", visibility: "shared" }))).data.id;
    const privateSpace = (await x.call("/spaces", request({ body: "私人实验" }))).data.id;
    assert.equal((await x.call(`/environments/${id}/use`, request({ version: 1, spaceId: shared }))).status, 403);
    const used = (await x.call(`/environments/${id}/use`, request({ version: 1, spaceId: privateSpace }))).data;
    await x.call(`/spaces/${privateSpace}/artifacts`, request({ artifactId: used.id, baseVersion: 1, title: "后来的普通笔记", kind: "markdown", body: "通用编辑不会删除历史", reason: "修改显示" }));
    assert.equal((await x.call(`/spaces/${privateSpace}/share`, { baseVersion: 1, visibility: "shared" })).status, 403);
    await x.call(`/environments/${id}/share`, request({ baseVersion: 1, visibility: "shared" }));
    assert.equal((await x.call(`/spaces/${privateSpace}/share`, { baseVersion: 1, visibility: "shared" })).status, 200);
    assert.equal((await x.call(`/spaces/${privateSpace}`, undefined, x.b)).status, 200);
    await x.call(`/environments/${id}/share`, request({ baseVersion: 1, visibility: "private" }));
    assert.equal((await x.call(`/spaces/${privateSpace}`, undefined, x.b)).status, 200);
    const another = (await x.call("/environments", request(definition()))).data.id;
    await x.call(`/environments/${another}/versions`, request({ baseVersion: 1, purpose: "可公开的新版本", files: files("public-v2"), reason: "只公开新内容" }));
    await x.call(`/environments/${another}/share`, request({ baseVersion: 2, visibility: "shared" }));
    assert.equal((await x.call(`/environments/${another}/use`, request({ version: 1, spaceId: shared }))).status, 403);
  } finally { x.cleanup(); }
});

test("explicit historical publication unlocks only the selected private snapshot after current publication", async () => {
  const x = await setup();
  try {
    const id = (await x.call("/environments", request(definition({ files: files("selected-private-v1") })))).data.id;
    const spaceId = (await x.call("/spaces", request({ body: "需要保留旧实验" }))).data.id;
    await x.call(`/environments/${id}/use`, request({ version: 1, spaceId }));
    await x.call(`/environments/${id}/versions`, request({ baseVersion: 1, purpose: "另一私人草稿", files: files("unrelated-private-v2"), reason: "继续试验" }));
    await x.call(`/environments/${id}/versions`, request({ baseVersion: 2, purpose: "当前可公开版本", files: files("current-public-v3"), reason: "整理" }));
    assert.equal((await x.call(`/spaces/${spaceId}/share`, { baseVersion: 1, visibility: "shared" })).status, 403);
    const historical = request({ baseVersion: 3, version: 1, visibility: "shared" });
    assert.equal((await x.call(`/environments/${id}/share`, historical)).status, 403);
    await x.call(`/environments/${id}/share`, request({ baseVersion: 3, visibility: "shared" }));
    assert.equal((await x.call(`/spaces/${spaceId}/share`, { baseVersion: 1, visibility: "shared" })).status, 403);
    assert.equal((await x.call(`/environments/${id}/share`, historical, x.b)).status, 403);
    const published = await x.call(`/environments/${id}/share`, historical);
    assert.deepEqual(published.data, { id, version: 3, visibility: "shared", publishedVersion: 1 });
    assert.deepEqual((await x.call(`/environments/${id}/share`, historical)).data, published.data);
    assert.deepEqual((await x.call(`/environments/${id}`, undefined, x.b)).data.versions.map((v) => v.version), [3, 1]);
    assert.equal((await x.call(`/environments/${id}?version=2`, undefined, x.b)).status, 404);
    assert.equal((await x.call(`/environments/${id}?version=1`, undefined, x.b)).data.selected.files[1].content, "selected-private-v1");
    assert.equal((await x.call(`/spaces/${spaceId}/share`, { baseVersion: 1, visibility: "shared" })).status, 200);
    assert.equal((await x.call(`/environments/${id}/share`, request({ baseVersion: 3, version: 1, visibility: "private" }))).status, 403);
    assert.equal((await x.call(`/environments/${id}/share`, request({ baseVersion: 2, version: 1, visibility: "shared" }))).status, 409);
    await x.call(`/environments/${id}/share`, request({ baseVersion: 3, visibility: "private" }));
    assert.equal((await x.call(`/environments/${id}?version=1`, undefined, x.b)).status, 404);
    assert.equal((await x.call(`/spaces/${spaceId}`, undefined, x.b)).status, 200);
  } finally { x.cleanup(); }
});

test("use rechecks source withdrawal at commit", async () => {
  const x = await setup();
  try {
    const id = (await x.call("/environments", request(definition({ visibility: "shared" })))).data.id;
    const privateSpace = (await x.call("/spaces", request({ body: "保存到私人空间" }))).data.id;
    x.beforeBatch(() => x.call(`/environments/${id}/share`, request({ baseVersion: 1, visibility: "private" })));
    assert.equal((await x.call(`/environments/${id}/use`, request({ version: 1, spaceId: privateSpace }))).status, 409);
    assert.equal(await x.count("ws_artifacts"), 0);
    assert.equal(await x.count("ws_artifact_versions"), 0);
  } finally { x.cleanup(); }
});

test("file validation accepts flexible text definitions and enforces exact UTF-8, path, secret and request limits", async () => {
  const fail = (message, status) => { throw Object.assign(new Error(message), { status }); };
  const validate = (value) => validateEnvironmentFiles(value, fail);
  const valid = [{ path: ".devcontainer/devcontainer.json", content: '{"build":{"dockerfile":"../Dockerfile"}}\n' }, ...files()];
  assert.deepEqual(validate(valid), valid);
  assert.deepEqual(validate([{ path: "Proof.lean", content: "theorem identity (p : Prop) : p → p := id" }, { path: "extensionless", content: "free text" }]), [{ path: "Proof.lean", content: "theorem identity (p : Prop) : p → p := id" }, { path: "extensionless", content: "free text" }]);
  assert.deepEqual(validate([{ path: "说明.md", content: "自由说明\n" }]), [{ path: "说明.md", content: "自由说明\n" }]);
  assert.equal(validate([{ path: "large.txt", content: "界".repeat(9333) + "a" }])[0].content.length, 9334);
  assert.throws(() => validate([{ path: "large.txt", content: "界".repeat(9334) }]), { status: 422 });
  for (const invalid of [
    [], Array.from({ length: 21 }, (_, i) => ({ path: `${i}.txt`, content: "" })),
    [{ path: "a.txt", content: "x" }, { path: "A.txt", content: "y" }],
    [{ path: "a", content: "file" }, { path: "A/b.txt", content: "nested" }],
    [{ path: "a/b.txt", content: "nested" }, { path: "A", content: "file" }],
    [{ path: "é", content: "file" }, { path: "e\u0301/b", content: "nested" }],
    [{ path: "large.txt", content: "x".repeat(14000) }, { path: "next.txt", content: "y".repeat(14001) }],
    [{ path: "binary.txt", content: "a\u0000b" }], [{ path: "a.txt", content: 1 }],
    [{ path: "notes.txt", content: "-----BEGIN OPENSSH PRIVATE KEY-----\nsecret" }],
  ]) assert.throws(() => validate(invalid), { status: 422 });
  for (const p of ["/etc/passwd", "../file.py", "src/../../file.py", "./file.py", "a//b.py", "C:/file.py", "a\\file.py", "a/%2e%2e/file.py", " a.py", "a./b.py", ".env", ".env.local", ".ssh/config", ".aws/config", "id_rsa", "keys/id_ed25519.pub", ".npmrc", ".docker/config.json", "credentials.json", "secrets.yaml", "key.pem", "a".repeat(158) + ".py"]) {
    assert.throws(() => validate([{ path: p, content: "x" }]), { status: 422 }, p);
  }
  const x = await setup();
  try {
    assert.equal((await x.call("/environments", request(definition({ files: [{ path: "valid.txt", content: "a".repeat(28000) }] })))).status, 201);
    assert.equal((await x.call("/environments", request(definition({ files: [{ path: "valid.txt", content: "a".repeat(28001) }] })))).status, 422);
    assert.equal((await x.call("/environments", request(definition({ files: [{ path: "valid.txt", content: "\n".repeat(26000) }] })))).status, 413);
    assert.equal((await x.call("/environments", request(definition({ visibility: "public" })))).status, 422);
    assert.equal(await x.count("ws_environments"), 1);
  } finally { x.cleanup(); }
});
