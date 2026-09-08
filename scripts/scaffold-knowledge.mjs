import fs from "node:fs/promises";
import path from "node:path";
import { root, write } from "./lib.mjs";

const id = process.argv[2];
if (!id || !/^[a-z0-9-]+$/.test(id)) {
  console.error("Usage: npm run scaffold:knowledge -- <knowledge-id>");
  process.exit(1);
}
const rel = `content/knowledge/${id}.json`;
try {
  await fs.access(path.join(root, rel));
  console.error(`Knowledge object already exists: ${id}`);
  process.exit(1);
} catch {}

// Legacy seed adapter; service knowledge is created from an exploration artifact.
const item = {
  id,
  version: 1,
  status: "draft",
  title: "待命名知识",
  summary: "它在回答什么？",
  body: "在这里自由组织解释、依据、适用范围与尚未解决的问题。",
  unresolved: "草稿，依据尚待核查。",
  sources: [],
};
await write(rel, JSON.stringify(item, null, 2) + "\n");
console.log(`Scaffolded draft Knowledge: ${id}`);
console.log(`- ${rel}`);
console.log(
  "Draft knowledge is validated but not visible until `npm run publish:knowledge -- <id>`.",
);
