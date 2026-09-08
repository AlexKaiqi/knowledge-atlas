import test from "node:test";
import assert from "node:assert/strict";
import { createAgentHandoff } from "../site/assets/agent-handoff.js";

test("Agent handoff contains only selected versions and explicitly included discussion", () => {
  const data = {
    format: "knowledge-atlas/exploration-1", exportedAt: 0,
    space: { id: "space", title: "问题", visibility: "private" },
    preferences: { secret: "private-profile" },
    messages: [{ id: "m1", name: "作者", body: "private-discussion" }],
    artifacts: [
      { id: "a", version: 1, title: "旧稿", body: "old-private-draft" },
      { id: "a", version: 2, title: "当前成果", kind: "markdown", body: "selected-result\n```\nembedded-fence", metadata: { input: "selected-input" } },
      { id: "b", version: 1, title: "另一个成果", body: "unselected-result" },
    ],
    jobs: [{ id: "j", artifact: "a", status: "succeeded", input: "old-private-input" }, { id: "k", artifact: "b", input: "unselected-input" }],
  };
  const text = createAgentHandoff(data, { task: "改变条件", versions: ["a@2"] });
  for (const omitted of ["private-profile", "private-discussion", "old-private-draft", "old-private-input", "unselected-result", "unselected-input"]) assert.ok(!text.includes(omitted));
  assert.ok(text.includes("selected-result"));
  assert.ok(text.includes("selected-input"));
  assert.ok(text.includes("````\nselected-result"));
  assert.ok(text.includes("私人探索"));
  const discussion = createAgentHandoff(data, { task: "继续", discussion: true });
  assert.ok(discussion.includes("private-discussion"));
  assert.ok(!discussion.includes("selected-result"));
  assert.throws(() => createAgentHandoff(data, { task: "继续", versions: ["missing@1"] }), /不可用/);
});
