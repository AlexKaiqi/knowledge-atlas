import fs from "node:fs/promises";
import { readJson, write } from "./lib.mjs";
import { validateLearning } from "./learning-contract.mjs";
const filename = process.argv[2];
if (!filename) {
  console.error(
    "Usage: npm run apply:revision -- <exported-proposal.json>\nRun only after completing the human review in docs/KNOWLEDGE_REVIEW.md.",
  );
  process.exit(1);
}
const r = JSON.parse(await fs.readFile(filename, "utf8"));
if (
  !/^knowledge:[a-z0-9-]+$/.test(r.target) ||
  !["summary", "statement", "intuition", "example", "check"].includes(
    r.field,
  ) ||
  typeof r.id !== "string" ||
  typeof r.afterText !== "string" ||
  !r.afterText.trim() ||
  typeof r.sources !== "string" ||
  !r.sources.trim()
)
  throw new Error("Invalid proposal");
const id = r.target.slice(10),
  rel = `content/knowledge/${id}.json`;
const k = await readJson(rel);
const guides = await readJson("content/learning/knowledge-guides.json");
const target = ["summary", "statement"].includes(r.field) ? k : guides[id];
if (k.version !== r.baseVersion || target[r.field] !== r.beforeText)
  throw new Error(
    "Proposal is stale: compare against current text and submit a fresh revision.",
  );
target[r.field] = r.afterText;
k.version++;
k.revisionHistory = [
  ...(k.revisionHistory || []),
  {
    id: r.id,
    version: k.version,
    field: r.field,
    beforeText: r.beforeText,
    afterText: r.afterText,
    reason: r.reason,
    sources: r.sources,
    nickname: r.nickname,
    mergedAt: new Date().toISOString(),
  },
];
const ids = await readJson("content/knowledge/index.json");
const knowledge = await Promise.all(
  ids.map((x) => (x === id ? k : readJson(`content/knowledge/${x}.json`))),
);
const errors = validateLearning({
  questions: await readJson("content/learning/questions.json"),
  knowledge,
  guides,
  methods: await readJson("content/learning/methods.json"),
});
if (errors.length) throw new Error(errors.join("\n"));
await write(rel, JSON.stringify(k, null, 2) + "\n");
await write(
  "content/learning/knowledge-guides.json",
  JSON.stringify(guides, null, 2) + "\n",
);
console.log(
  `Applied reviewed proposal ${r.id} to ${id} v${k.version}. Inspect the diff and run npm run check before publishing.`,
);
