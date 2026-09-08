import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createApi } from "../server/api.mjs";
import { openLocalDatabase } from "../server/local-db.mjs";
import { claimJob, finishJob, recoverJobs } from "../server/jobs.mjs";
import {
  dockerCapability,
  startDockerRunner,
} from "../server/docker-runner.mjs";
const migrations = new URL("../drizzle", import.meta.url).pathname;
function setup(options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-workspace-")),
    file = path.join(dir, "db.sqlite");
  let db = openLocalDatabase(file, migrations);
  const api = createApi({
    catalog: { "knowledge:amdahls-law": { version: 1 } },
    ...options,
  });
  let a, b;
  async function call(route, body, cookie = a, extra = {}) {
    const response = await api(
      new Request("http://localhost/api/workspace" + route, {
        method: body ? "POST" : "GET",
        headers: {
          ...(body
            ? { "content-type": "application/json", origin: "http://localhost" }
            : {}),
          cookie: cookie || "",
          ...extra,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      db,
    );
    const data = await response.json();
    return {
      status: response.status,
      data,
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  }
  return {
    get db() {
      return db;
    },
    call,
    async users() {
      a = (await call("/session")).cookie;
      b = (await call("/session", null, "")).cookie;
      return { a, b };
    },
    async reopen() {
      db.close();
      db = openLocalDatabase(file, migrations);
    },
    cleanup() {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
const request = (p) => ({ ...p, requestId: crypto.randomUUID() });
test("explorations survive restart, enforce joining and actor identity, replay writes and isolate profiles", async () => {
  const x = setup();
  try {
    const { a, b } = await x.users();
    const p = request({ body: "一个需要长期探索的问题" }),
      created = await x.call("/spaces", p),
      id = created.data.id;
    assert.equal(created.status, 201);
    assert.equal((await x.call("/spaces", p)).data.id, id);
    assert.equal(
      (await x.call("/spaces", { ...p, body: "different" })).status,
      409,
    );
    assert.equal((await x.call(`/spaces/${id}`, null, b)).status, 404);
    assert.equal((await x.call(`/spaces/${id}/export`, null, b)).status, 404);
    assert.deepEqual((await x.call(`/spaces/${id}`)).data.jobs, []);
    // Explicit legacy Agent todos remain readable; a question alone starts no fake Agent job.
    await x.call(`/spaces/${id}/jobs`, request({ runner: "agent", input: { prompt: "核对这个解释" } }));
    const pending = (await x.call(`/spaces/${id}`)).data.jobs[0];
    assert.equal(pending.status, "waiting_provider");
    assert.equal(pending.prompt, "核对这个解释");
    await x.call("/profile", {
      name: "Alice",
      goals: "理解科学方法",
      interests: "物理",
      guidance: "多举例",
    });
    assert.equal(
      (await x.call("/session", null, b)).data.preferences.goals,
      undefined,
    );
    assert.equal(
      (
        await x.call(`/spaces/${id}/share`, {
          baseVersion: 1,
          visibility: "shared",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await x.call(
          `/spaces/${id}/messages`,
          request({ body: "未加入不能写" }),
          b,
        )
      ).status,
      403,
    );
    assert.equal((await x.call(`/spaces/${id}/join`, {}, b)).status, 200);
    assert.equal(
      (
        await x.call(
          `/spaces/${id}/messages`,
          request({ body: "我有一个反例", actor: "agent", kind: "agent" }),
          b,
        )
      ).status,
      201,
    );
    assert.equal(
      (
        await x.call(
          `/spaces/${id}/share`,
          { baseVersion: 2, visibility: "private" },
          b,
        )
      ).status,
      403,
    );
    await x.reopen();
    const loaded = (await x.call(`/spaces/${id}`, null, a)).data;
    assert.equal(loaded.messages.length, 2);
    assert.equal(loaded.messages[0].name, "Alice");
    assert.equal(loaded.messages[1].name, "探索者");
    assert.equal(
      (
        await x.call("/session", null, a, {
          "oai-authenticated-user-id": "forged",
        })
      ).data.identity,
      "visitor",
    );
    const c = (await x.call("/session", null, "")).cookie;
    await x.call(`/spaces/${id}/share`, {
      baseVersion: 2,
      visibility: "private",
    });
    assert.equal((await x.call(`/spaces/${id}/join`, {}, c)).status, 404);
    assert.equal((await x.call(`/spaces/${id}`, null, b)).status, 200);
  } finally {
    x.cleanup();
  }
});
test("stable gateway account can resume across cookies, local headers cannot impersonate it", async () => {
  const x = setup({
    accountForRequest: (req) => ({
      id: req.headers.get("test-account") || "account-a",
    }),
  });
  try {
    await x.users();
    const id = (await x.call("/spaces", request({ body: "账号持久探索" }))).data
      .id;
    assert.equal((await x.call(`/spaces/${id}`, null, "")).status, 200);
    assert.equal(
      (await x.call(`/spaces/${id}`, null, "", { "test-account": "account-b" }))
        .status,
      404,
    );
  } finally {
    x.cleanup();
  }
});
test("artifact revisions preserve history and recover a lost response; cancellation fences worker output", async () => {
  const x = setup();
  try {
    const { b } = await x.users();
    const sid = (await x.call("/spaces", request({ body: "比较不同输入" })))
      .data.id;
    const artifact = (
      await x.call(
        `/spaces/${sid}/artifacts`,
        request({ title: "观察", kind: "markdown", body: "最初的观察" }),
      )
    ).data;
    const update = request({
      title: "观察",
      kind: "markdown",
      body: "修正的观察",
      artifactId: artifact.id,
      baseVersion: 1,
      reason: "补充条件",
    });
    assert.equal(
      (await x.call(`/spaces/${sid}/artifacts`, update)).status,
      201,
    );
    assert.equal(
      (await x.call(`/spaces/${sid}/artifacts`, update)).data.version,
      2,
    );
    assert.equal(
      (
        await x.call(`/spaces/${sid}/artifacts`, {
          ...update,
          requestId: crypto.randomUUID(),
        })
      ).status,
      409,
    );
    assert.equal(
      (await x.call(`/spaces/${sid}/artifacts/${artifact.id}`)).data.versions[1]
        .body,
      "最初的观察",
    );
    const builtin = (
      await x.call(
        `/spaces/${sid}/jobs`,
        request({ runner: "parallel", input: { p: 0.8, s: 4 } }),
      )
    ).data;
    assert.equal(
      (await x.call(`/spaces/${sid}`)).data.jobs.find(
        (j) => j.id === builtin.id,
      ).status,
      "succeeded",
    );
    const result = (await x.call(`/spaces/${sid}`)).data.artifacts.find(
      (a) => a.kind === "model",
    );
    assert.equal(JSON.parse(result.body).speedup, 2.5);
    assert.deepEqual(result.metadata.input, { p: 0.8, s: 4 });
    const id = crypto.randomUUID(),
      now = Date.now();
    const owner = (
      await x.db
        .prepare("SELECT owner FROM ws_explorations WHERE id=?")
        .bind(sid)
        .first()
    ).owner;
    await x.db
      .prepare(
        "INSERT INTO ws_jobs(id,space,actor,runner,input,status,created_at,updated_at) VALUES (?,?,?,?,?,'queued',?,?)",
      )
      .bind(id, sid, owner, "parallel", '{"p":0.8,"s":4}', now, now)
      .run();
    const job = await claimJob(x.db, id);
    assert.ok(job.lease);
    assert.equal(await claimJob(x.db, id), null);
    assert.equal(
      (await x.call(`/spaces/${sid}/jobs/${id}/cancel`, {}, b)).status,
      404,
    );
    await x.call(`/spaces/${sid}/jobs/${id}/cancel`, {});
    assert.equal(
      await finishJob(x.db, job, {
        title: "late",
        kind: "markdown",
        body: "late",
        metadata: {},
      }),
      false,
    );
    assert.equal(
      (await x.call(`/spaces/${sid}`)).data.artifacts.some(
        (a) => a.title === "late",
      ),
      false,
    );
    const retry = (await x.call(`/spaces/${sid}/jobs/${id}/retry`, request({})))
      .data;
    assert.notEqual(retry.id, id);
    assert.equal(
      (await x.call(`/spaces/${sid}`)).data.jobs.find((j) => j.id === retry.id)
        .status,
      "succeeded",
    );
    await x.db
      .prepare(
        "UPDATE ws_jobs SET status='running',lease='expired',lease_until=?,updated_at=? WHERE id=?",
      )
      .bind(now - 1, now, id)
      .run();
    await recoverJobs(x.db);
    assert.equal(
      (await x.call(`/spaces/${sid}`)).data.jobs.find((j) => j.id === id)
        .status,
      "failed",
    );
  } finally {
    x.cleanup();
  }
});
test("knowledge is free-form, versioned, traces selected output, and sharing excludes private revisions and withdrawn relations", async () => {
  const x = setup();
  try {
    const { b } = await x.users();
    const sid = (await x.call("/spaces", request({ body: "自由共建" }))).data
      .id;
    const artifact = (
      await x.call(
        `/spaces/${sid}/artifacts`,
        request({
          title: "一个解释",
          kind: "markdown",
          body: "私人草稿，之后不应暴露",
        }),
      )
    ).data;
    const did = (
      await x.call(
        `/spaces/${sid}/artifacts/${artifact.id}/knowledge`,
        request({ version: 1 }),
      )
    ).data.id;
    assert.equal((await x.call(`/knowledge/${did}`, null, b)).status, 404);
    const edit = request({
      baseVersion: 1,
      title: "公开解释",
      body: "分享这个选定版本",
      reason: "改写为可复用内容",
      visibility: "shared",
      status: "draft",
      evidence: [],
      limits: "尚需核查",
      relations: [],
    });
    assert.equal((await x.call(`/knowledge/${did}`, edit)).status, 201);
    assert.equal((await x.call(`/knowledge/${did}`, edit)).data.version, 2);
    const publicRead = (await x.call(`/knowledge/${did}`, null, b)).data;
    assert.equal(publicRead.versions.length, 1);
    assert.equal(publicRead.versions[0].body, "分享这个选定版本");
    assert.equal((await x.call(`/knowledge/${did}`)).data.versions.length, 2);
    assert.ok(!JSON.stringify(publicRead).includes("私人草稿"));
    assert.equal(
      (
        await x.call(
          `/knowledge/${did}`,
          request({ ...edit, baseVersion: 2, status: "maintained" }),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await x.call(
          `/knowledge/${did}`,
          request({ ...edit, baseVersion: 2, evidence: { bad: true } }),
        )
      ).status,
      400,
    );
    const other = (
      await x.call(
        `/spaces/${sid}/artifacts/${artifact.id}/knowledge`,
        request({ version: 1 }),
      )
    ).data.id;
    await x.call(
      `/knowledge/${other}`,
      request({ ...edit, baseVersion: 1, title: "另一个知识" }),
    );
    const relations = [
      {
        target: `document:${other}`,
        kind: "explains",
        reason: "提供进一步解释",
      },
      {
        target: "knowledge:amdahls-law",
        kind: "example-of",
        reason: "一个具体应用",
      },
    ];
    assert.equal(
      (
        await x.call(
          `/knowledge/${did}`,
          request({ ...edit, baseVersion: 2, relations }),
        )
      ).status,
      201,
    );
    assert.equal(
      (await x.call(`/knowledge/${did}`, null, b)).data.relations.length,
      2,
    );
    await x.call(
      `/knowledge/${other}`,
      request({ ...edit, baseVersion: 2, visibility: "private" }),
    );
    assert.equal(
      (await x.call(`/knowledge/${did}`, null, b)).data.relations.length,
      1,
    );
    assert.equal((await x.call(`/knowledge/${did}`)).data.relations.length, 2);
  } finally {
    x.cleanup();
  }
});
test("atomic batches roll back on conflict without partial versions", async () => {
  const x = setup();
  try {
    await assert.rejects(
      x.db.batch([
        x.db
          .prepare(
            "INSERT INTO ws_actors(id,name,created_at) VALUES ('same','a',1)",
          )
          .bind(),
        x.db
          .prepare(
            "INSERT INTO ws_actors(id,name,created_at) VALUES ('same','b',2)",
          )
          .bind(),
      ]),
    );
    assert.equal(
      await x.db
        .prepare("SELECT id FROM ws_actors WHERE id='same'")
        .bind()
        .first(),
      null,
    );
  } finally {
    x.cleanup();
  }
});
test(
  "Docker executes in a bounded container and stores an independent artifact",
  { skip: process.env.ATLAS_TEST_DOCKER !== "1" },
  async () => {
    const capability = dockerCapability();
    assert.ok(capability, "local Python image must be available");
    const x = setup({ docker: true });
    let stop;
    try {
      await x.users();
      const id = (await x.call("/spaces", request({ body: "容器执行验证" })))
        .data.id;
      const jid = (
        await x.call(
          `/spaces/${id}/jobs`,
          request({
            runner: "docker",
            input: {
              code: "import os\nprint('<h1>真实输出</h1>')\nprint('<p>uid: '+str(os.getuid())+'</p>')",
            },
          }),
        )
      ).data.id;
      stop = startDockerRunner(x.db, capability);
      let job;
      for (let i = 0; i < 80; i++) {
        await new Promise((r) => setTimeout(r, 250));
        job = (await x.call(`/spaces/${id}`)).data.jobs.find(
          (j) => j.id === jid,
        );
        if (["succeeded", "failed"].includes(job.status)) break;
      }
      assert.equal(job.status, "succeeded", job.error);
      const data = (await x.call(`/spaces/${id}`)).data,
        artifact = data.artifacts.find((a) => a.id === job.artifact);
      assert.equal(artifact.kind, "html");
      assert.match(artifact.body, /uid: 65534/);
      assert.equal(artifact.metadata.image, capability.image);
      const cancelling = (
        await x.call(
          `/spaces/${id}/jobs`,
          request({
            runner: "docker",
            input: { code: "import time\ntime.sleep(30)\nprint('too late')" },
          }),
        )
      ).data.id;
      for (let i = 0; i < 30; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (
          (await x.call(`/spaces/${id}`)).data.jobs.find(
            (j) => j.id === cancelling,
          ).status === "running"
        )
          break;
      }
      await x.call(`/spaces/${id}/jobs/${cancelling}/cancel`, {});
      await new Promise((resolve) => setTimeout(resolve, 1000));
      assert.equal((await x.call(`/spaces/${id}`)).data.artifacts.length, 1);
      assert.equal(
        execFileSync(
          "docker",
          ["ps", "-q", "--filter", `name=atlas-${cancelling}`],
          { encoding: "utf8" },
        ).trim(),
        "",
      );
      await stop();
      stop = null;
      await x.reopen();
      assert.equal(
        (await x.call(`/spaces/${id}`)).data.artifacts[0].body,
        artifact.body,
      );
    } finally {
      if (stop) await stop();
      x.cleanup();
    }
  },
);

test("knowledge export reconstructs stable Markdown directories without overwriting earlier exports", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-export-"));
  try {
    const id = crypto.randomUUID(),
      input = path.join(dir, "export.json"),
      document = {
        id,
        title: "自由正文",
        version: 2,
        visibility: "shared",
        status: "draft",
      };
    fs.writeFileSync(
      input,
      JSON.stringify({
        format: "knowledge-atlas/knowledge-1",
        document,
        versions: [
          {
            version: 2,
            body: "## 一个问题\n\n自由解释。",
            reason: "整理",
            metadata: { evidence: [] },
          },
        ],
        relations: [],
        relationsByVersion: [],
        provenance: { note: "selected output" },
      }),
    );
    const command = new URL("../scripts/export-knowledge.mjs", import.meta.url)
      .pathname;
    execFileSync(process.execPath, [command, input, dir]);
    assert.equal(
      fs.readFileSync(path.join(dir, "knowledge", id, "index.md"), "utf8"),
      "## 一个问题\n\n自由解释。\n",
    );
    assert.equal(
      JSON.parse(
        fs.readFileSync(path.join(dir, "knowledge", id, "metadata.json")),
      ).document.id,
      id,
    );
    assert.throws(() =>
      execFileSync(process.execPath, [command, input, dir], { stdio: "pipe" }),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});


test("space creation defaults to private and rejects invalid visibility without partial records", async () => {
  const x = setup();
  try {
    const { b } = await x.users();
    const implicit = await x.call("/spaces", request({ body: "默认私人问题" }));
    const explicit = await x.call("/spaces", request({ body: "明确私人问题", visibility: "private" }));
    assert.equal(implicit.status, 201);
    assert.equal(explicit.status, 201);
    for (const id of [implicit.data.id, explicit.data.id]) {
      assert.equal((await x.call(`/spaces/${id}`)).data.space.visibility, "private");
      assert.equal((await x.call(`/spaces/${id}`, null, b)).status, 404);
      assert.equal((await x.call(`/spaces/${id}/join`, {}, b)).status, 404);
    }
    assert.deepEqual((await x.call("/spaces?view=shared", null, b)).data.spaces, []);
    for (const visibility of [null, "", "public", "Shared", " shared ", false, 0, [], {}]) {
      const result = await x.call("/spaces", request({ body: "无效范围", visibility }));
      assert.equal(result.status, 422, JSON.stringify(visibility));
      assert.equal(result.data.error, "请选择分享范围。");
    }
    for (const table of ["ws_explorations", "ws_members", "ws_messages", "ws_requests"]) {
      assert.equal((await x.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).bind().first()).count, 2);
    }
  } finally {
    x.cleanup();
  }
});

test("shared creation is discoverable, joinable and idempotent without exposing existing private spaces", async () => {
  const x = setup();
  try {
    const { b } = await x.users();
    const privateSpace = (await x.call("/spaces", request({ body: "此前的私人问题" }))).data.id;
    const p = request({ body: "一起讨论这个问题", visibility: "shared", askAgent: false });
    const created = await x.call("/spaces", p);
    assert.equal(created.status, 201);
    const id = created.data.id;
    assert.deepEqual((await x.call("/spaces", p)).data, created.data);
    assert.equal((await x.call("/spaces", { ...p, visibility: "private" })).status, 409);
    const publicList = (await x.call("/spaces?view=shared", null, b)).data.spaces;
    assert.deepEqual(publicList.map((space) => space.id), [id]);
    assert.equal(publicList[0].visibility, "shared");
    assert.equal(publicList[0].version, 1);
    assert.equal(publicList[0].role, null);
    const beforeJoin = (await x.call(`/spaces/${id}`, null, b)).data;
    assert.equal(beforeJoin.space.visibility, "shared");
    assert.equal(beforeJoin.messages.length, 1);
    assert.equal(beforeJoin.messages[0].id, created.data.messageId);
    assert.equal(beforeJoin.messages[0].body, p.body);
    assert.equal(beforeJoin.members.length, 1);
    assert.equal(beforeJoin.members[0].role, "owner");
    assert.equal((await x.call(`/spaces/${id}/messages`, request({ body: "还没加入" }), b)).status, 403);
    assert.equal((await x.call(`/spaces/${id}/join`, {}, b)).status, 200);
    assert.equal((await x.call(`/spaces/${id}/join`, {}, b)).status, 200);
    assert.equal((await x.call(`/spaces/${id}`, null, b)).data.space.role, "contributor");
    assert.equal((await x.call(`/spaces/${id}/messages`, request({ body: "加入后补充" }), b)).status, 201);
    assert.deepEqual((await x.call("/spaces", null, b)).data.spaces.map((space) => space.id), [id]);
    assert.equal((await x.call(`/spaces/${privateSpace}`, null, b)).status, 404);
    assert.equal((await x.call(`/spaces/${privateSpace}`)).data.space.visibility, "private");
    await x.call(`/spaces/${id}/share`, { baseVersion: 1, visibility: "private" });
    assert.deepEqual((await x.call("/spaces", p)).data, created.data);
    assert.deepEqual((await x.call("/spaces?view=shared", null, b)).data.spaces, []);
    const loaded = (await x.call(`/spaces/${id}`)).data;
    assert.equal(loaded.space.visibility, "private");
    assert.equal(loaded.space.version, 2);
    assert.equal(loaded.messages.length, 2);
    assert.equal(loaded.members.length, 2);
  } finally {
    x.cleanup();
  }
});

test("failed shared creation rolls back visibility, message, membership, Agent job and replay record together", async () => {
  const x = setup({ agent: { available: true } });
  try {
    await x.users();
    await x.db.prepare("CREATE TRIGGER reject_membership BEFORE INSERT ON ws_members BEGIN SELECT RAISE(ABORT, 'test membership failure'); END").bind().run();
    const result = await x.call("/spaces", request({ body: "不能部分创建", visibility: "shared" }));
    assert.equal(result.status, 500);
    for (const table of ["ws_explorations", "ws_members", "ws_messages", "ws_jobs", "ws_requests"]) {
      assert.equal((await x.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).bind().first()).count, 0);
    }
  } finally {
    x.cleanup();
  }
});

test('knowledge context keeps the question as the exploration title', async () => {
  const x = setup();
  try {
    await x.users();
    const result = await x.call('/spaces', request({ title: '并行会快多少？', body: '参考知识与来源：阿姆达尔定律\n\n我的问题：并行会快多少？' }));
    const loaded = (await x.call(`/spaces/${result.data.id}`)).data;
    assert.equal(loaded.space.title, '并行会快多少？');
    assert.match(loaded.messages[0].body, /参考知识与来源/);
    assert.equal((await x.call('/spaces', request({ title: 'x'.repeat(81), body: '问题' }))).status, 400);
  } finally { x.cleanup(); }
});
