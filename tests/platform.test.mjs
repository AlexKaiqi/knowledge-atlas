import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApi } from "../server/api.mjs";
import { openLocalDatabase } from "../server/local-db.mjs";
import {
  parallelModel,
  causalModel,
} from "../site/runtime/core/learning-models.js";
import { validateLearning } from "../scripts/learning-contract.mjs";
const read = (p) =>
  JSON.parse(fs.readFileSync(new URL("../" + p, import.meta.url), "utf8"));
const knowledge = read("content/knowledge/index.json").map((id) =>
  read(`content/knowledge/${id}.json`),
);
const content = {
  questions: read("content/learning/questions.json"),
  knowledge,
  guides: read("content/learning/knowledge-guides.json"),
  methods: read("content/learning/methods.json"),
};
test("learning contract catches missing teaching support, false review status and invalid answers", () => {
  assert.deepEqual(validateLearning(content), []);
  const broken = structuredClone(content);
  broken.questions[0].transfer.answer = 99;
  broken.questions[1].hintResponses = [];
  broken.questions[2].reviewStatus = "learner-tried";
  broken.knowledge[0].sources = [];
  const errors = validateLearning(broken);
  assert.ok(errors.some((e) => e.includes("answer index")));
  assert.ok(errors.some((e) => e.includes("specific response")));
  assert.ok(errors.some((e) => e.includes("review evidence")));
  assert.ok(errors.some((e) => e.includes("missing sources")));
});
test("parallel model respects unchanged work and limiting cases", () => {
  assert.equal(parallelModel(0.8, 4).speedup, 2.5);
  assert.equal(parallelModel(0, 32).speedup, 1);
  assert.equal(parallelModel(1, 4).speedup, 4);
  assert.equal(parallelModel(0.5, 100).limit, 2);
  assert.throws(() => parallelModel(1.1, 4), RangeError);
});
test("causal model has confounding reversal while umbrella protects in each weather", () => {
  const observed = causalModel(0.5, "observe"),
    intervened = causalModel(0.5, "intervene");
  assert.ok(observed.umbrella > observed.without);
  assert.ok(intervened.umbrella < intervened.without);
  assert.equal(intervened.umbrella, 0.20500000000000002);
  for (const r of [0.05, 0.5, 0.95]) {
    const x = causalModel(r, "intervene");
    assert.ok(x.umbrella < x.without);
    assert.ok(x.umbrella >= 0 && x.without <= 1);
  }
  assert.throws(() => causalModel(0), RangeError);
});
test("public contributions persist; private notes are isolated; experiment snapshots remain distinct", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-api-"));
  const file = path.join(dir, "test.sqlite");
  let db = openLocalDatabase(
    file,
    new URL("../drizzle", import.meta.url).pathname,
  );
  const catalog = {
    "question:test": { version: 1 },
    "practice:parallel": { version: 1 },
    "knowledge:test": {
      version: 2,
      summary: "Original statement",
      statement: "Formal statement",
      example: "An example",
    },
  };
  const api = createApi({ catalog });
  async function call(route, body, cookie = "", origin = "http://localhost") {
    return api(
      new Request("http://localhost/api/" + route, {
        method: body ? "POST" : "GET",
        headers: {
          ...(body ? { "content-type": "application/json", origin } : {}),
          cookie,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      db,
    );
  }
  const a = (await call("session")).headers.get("set-cookie").split(";")[0];
  const b = (await call("session")).headers.get("set-cookie").split(";")[0];
  try {
    assert.equal(
      (
        await call(
          "notes",
          {
            target: "question:test",
            title: "Private",
            body: "Only A",
            data: {},
            stage: "started",
            reviewAt: null,
          },
          a,
        )
      ).status,
      200,
    );
    assert.equal((await (await call("notes", null, b)).json()).notes.length, 0);
    const experiment = {
      target: "practice:parallel",
      title: "Experiment",
      body: "Observation",
      data: { result: parallelModel(0.8, 4) },
      stage: "saved",
    };
    assert.equal((await call("notes", experiment, a)).status, 201);
    assert.equal(
      (
        await call(
          "notes",
          { ...experiment, data: { result: parallelModel(0.9, 4) } },
          a,
        )
      ).status,
      201,
    );
    let notes = (await (await call("notes", null, a)).json()).notes;
    assert.equal(
      notes.filter((n) => n.target.startsWith("practice:")).length,
      2,
    );
    assert.notEqual(notes[0].id, notes[1].id);
    assert.equal(
      (await call("notes", { ...experiment, target: "constructor" }, a)).status,
      400,
    );
    assert.equal(
      (await call("notes", { ...experiment, target: "general" }, a)).status,
      400,
    );
    assert.equal(
      (await call("notes", experiment, a, "https://foreign.example")).status,
      403,
    );
    const p = {
      target: "knowledge:test",
      kind: "evidence",
      title: "A counterexample",
      body: "<script>alert(1)</script>",
      nickname: "Reader",
    };
    const post = await call("discussions", p, a);
    assert.equal(post.status, 201);
    const { id } = await post.json();
    assert.equal(
      (
        await call(
          "discussions",
          { ...p, parent: id, title: "Reply", body: "Another explanation" },
          b,
        )
      ).status,
      201,
    );
    assert.equal(
      (await call("discussions", { ...p, parent: id, target: "general" }, b))
        .status,
      400,
    );
    for (let i = 0; i < 205; i++)
      await db
        .prepare(
          "INSERT INTO discussions (id,target,kind,title,body,nickname,owner,parent,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          "reply-" + i,
          p.target,
          "evidence",
          "Reply",
          "Details",
          "Reader",
          "test-owner",
          id,
          Date.now() + i,
        )
        .run();
    let discussions = (await (await call("discussions")).json()).discussions;
    assert.ok(discussions.some((d) => d.id === id && !d.parent));
    assert.ok(discussions.every((d) => !("owner" in d)));
    const revision = {
      target: "knowledge:test",
      baseVersion: 2,
      field: "summary",
      beforeText: "Original statement",
      afterText: "A clearer supported statement",
      reason: "Clarify conditions",
      sources: "Primary source and model",
      nickname: "Reader",
    };
    assert.equal(
      (await call("revisions", { ...revision, beforeText: "Stale text" }, a))
        .status,
      409,
    );
    assert.equal(
      (await call("revisions", { ...revision, baseVersion: 1 }, a)).status,
      409,
    );
    assert.equal((await call("revisions", revision, a)).status, 201);
    db.close();
    db = openLocalDatabase(
      file,
      new URL("../drizzle", import.meta.url).pathname,
    );
    notes = (await (await call("notes", null, a)).json()).notes;
    assert.equal(notes.length, 3);
    assert.equal((await (await call("notes", null, b)).json()).notes.length, 0);
    discussions = (await (await call("discussions")).json()).discussions;
    assert.ok(discussions.some((d) => d.body === p.body));
    const revisions = (await (await call("revisions")).json()).revisions;
    assert.equal(revisions.length, 1);
    assert.equal(revisions[0].status, "proposed");
    assert.equal(revisions[0].beforeText, "Original statement");
    assert.ok(!("owner" in revisions[0]));
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("free knowledge and questions do not require a fixed lesson template", () => {
  const flexible = structuredClone(content);
  flexible.questions = [
    { id: "an-open-question", title: "尚在探索中的开放问题", version: 1 },
  ];
  flexible.guides = {};
  flexible.knowledge = [
    {
      id: "original-observation",
      version: 1,
      title: "一次观察",
      status: "draft",
      body: "自由组织的观察与未知。",
    },
  ];
  assert.deepEqual(validateLearning(flexible), []);
});
