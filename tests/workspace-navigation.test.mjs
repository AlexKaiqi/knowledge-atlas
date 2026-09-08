import test from "node:test";
import assert from "node:assert/strict";
import { readWorkspaceRoute, workspaceUrl, knowledgeContext, contextualQuestion } from "../site/assets/workspace-navigation.js";
import { spaceCards, knowledgeCards, documentCards } from "../site/assets/workspace-scenes.js";
import { renderPublicKnowledge } from "../site/assets/public-knowledge.js";

const routeState = (...args) => {
  const { scene, id, knowledge, document } = readWorkspaceRoute(...args);
  return { scene, id, knowledge, document };
};
const origin = "https://atlas.example";
const entry = {
  entryPath: "/atlas/knowledge/causality/index.html",
  initialScene: "knowledge", initialKnowledge: "causality",
};

test("a public knowledge permalink opens its configured article only on the original entry path", () => {
  assert.deepEqual(routeState(origin + entry.entryPath, entry), {
    scene: "knowledge", id: null, knowledge: "causality", document: "",
  });
  assert.deepEqual(routeState(origin + "/atlas/explore/?s=private-space", entry), {
    scene: "conversation", id: "private-space", knowledge: "", document: "",
  });
  assert.equal(readWorkspaceRoute(origin + "/atlas/explore/", {
    entryPath: "/atlas/practice/index.html", initialScene: "practice",
  }).scene, "mine");
});

test("browser history routes preserve scenes and active exploration after entry through a knowledge page", () => {
  const routes = [
    { scene: "mine", id: null, knowledge: "", document: "" },
    { scene: "conversation", id: "current", knowledge: "", document: "" },
    { scene: "shared", id: "current", knowledge: "", document: "" },
    { scene: "mine", id: "current", knowledge: "", document: "" },
    { scene: "practice", id: "current", knowledge: "", document: "" },
    { scene: "knowledge", id: "current", knowledge: "", document: "" },
    { scene: "knowledge", id: "current", knowledge: "other-entry", document: "" },
    { scene: "knowledge", id: "current", knowledge: "", document: "12345678-1234-1234-1234-123456789abc" },
  ];
  for (const route of routes) {
    const url = workspaceUrl(origin + "/atlas/", route);
    assert.ok(url.startsWith("/atlas/explore/"));
    assert.deepEqual(routeState(origin + url, entry), route);
  }
});

test("an explicit document deep link takes precedence over a public entry default", () => {
  assert.deepEqual(routeState(origin + entry.entryPath + "?doc=12345678-1234-1234-1234-123456789abc", entry), {
    scene: "knowledge", id: null, knowledge: "", document: "12345678-1234-1234-1234-123456789abc",
  });
  assert.deepEqual(routeState(origin + entry.entryPath + "?view=conversation", entry), {
    scene: "conversation", id: null, knowledge: "", document: "",
  });
});

test("conversation links preserve the mobile return destination and reject unknown return values", () => {
  for (const returnScene of ["mine", "shared", "practice"]) {
    const url = workspaceUrl(origin + "/atlas/", { scene: "conversation", id: "current", returnScene });
    assert.equal(readWorkspaceRoute(origin + url, entry).returnScene, returnScene);
  }
  assert.equal(readWorkspaceRoute(origin + "/atlas/explore/?from=javascript:alert(1)").returnScene, null);
});

test("unknown scene values cannot become executable markup or unrecognized views", () => {
  assert.equal(readWorkspaceRoute(origin + "/atlas/explore/?view=unknown", entry).scene, "conversation");
  assert.equal(readWorkspaceRoute(origin + "/atlas/explore/?view=__proto__").scene, "conversation");
});

test("knowledge references preserve the chosen version and the existing unsent question", () => {
  const knowledge = { id: "causality", titleZh: "因果", title: "Causality", version: 3, summary: "成立需要条件。" };
  const reference = knowledgeContext(knowledge, origin + entry.entryPath);
  knowledge.version = 4;
  knowledge.summary = "后续改写";
  const draft = "我的原草稿\n还有一个反例。";
  const text = contextualQuestion(draft, reference);
  assert.ok(text.includes("「因果」v3"));
  assert.ok(text.includes("成立需要条件。"));
  assert.ok(!text.includes("后续改写"));
  assert.ok(text.endsWith(draft));
  assert.equal(contextualQuestion(draft, null), draft);
});

test("knowledge and exploration cards escape stored titles and preserve access labels", () => {
  const title = '<img src=x onerror="alert(1)">';
  const spaces = spaceCards([{ id: 's" autofocus', title, visibility: "private", role: "owner", updatedAt: 0 }], false);
  const documents = documentCards([{ id: 'd" autofocus', title, visibility: "shared", status: "draft", version: 2 }]);
  const knowledge = knowledgeCards([{ id: 'k" autofocus', title, titleZh: title, summary: title }], {});
  for (const html of [spaces, documents, knowledge]) {
    assert.ok(!html.includes("<img"));
    assert.ok(!/" autofocus(?:\s|>)/.test(html));
    assert.ok(html.includes("&lt;img"));
  }
  assert.ok(spaces.includes("私人探索"));
  assert.ok(documents.includes("本站共享"));
  assert.ok(documents.includes("草稿"));
});

test("public knowledge retains conditions and source labels without activating unsafe content", () => {
  const html = renderPublicKnowledge({
    knowledge: {
      id: "causality", titleZh: "因果", version: 3,
      summary: "<script>alert(1)</script>", assumptions: ["固定比较条件"],
      doesNotImply: ["相关就足够"],
      sources: [{ label: "危险来源", url: "javascript:alert(1)" }, { label: "原始证据", url: "https://example.org/paper" }],
    },
  });
  assert.ok(!/<script\b/.test(html));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(html.includes("固定比较条件"));
  assert.ok(html.includes("相关就足够"));
  assert.ok(html.includes("危险来源"));
  assert.ok(html.includes('href="https://example.org/paper"'));
  assert.ok(html.includes("不能据此宣称已经验证"));
});


test("the question home is unique while saved conversation and prefilled-question links retain their meaning", () => {
  assert.equal(readWorkspaceRoute(origin + '/').scene, 'mine');
  assert.equal(readWorkspaceRoute(origin + '/explore/').scene, 'mine');
  assert.equal(readWorkspaceRoute(origin + '/explore/?s=existing', { initialScene:'mine' }).scene, 'conversation');
  assert.equal(readWorkspaceRoute(origin + '/explore/?s=existing&view=mine', { initialScene:'mine' }).scene, 'mine');
  assert.equal(readWorkspaceRoute(origin + '/questions/example/', {initialScene:'conversation',initialQuestion:'预置问题'}).scene, 'conversation');
  assert.equal(readWorkspaceRoute(origin + '/practice/?s=existing', { initialScene:'practice' }).scene, 'practice');
});
