import fs from "node:fs/promises";
import path from "node:path";
import { build as bundle } from "esbuild";
import { root, readJson, write, copyDir } from "./lib.mjs";
import { renderHome } from "../site/pages/home.mjs";
import { renderCase } from "../site/pages/case.mjs";
import { renderExplore } from "../site/pages/explore.mjs";
import {
  renderPaths,
  renderQuestion,
  renderWikiIndex,
  renderWiki,
  renderCommunity,
  renderNotebook,
  renderPractice,
  renderExperiment,
  renderMethods,
  renderContribute,
} from "../site/pages/platform.mjs";

function llmsFull({ cases, planned, knowledge }) {
  const knowledgeText = knowledge
    .map(
      (item) => `## ${item.titleZh} (${item.title})

- ID: ${item.id}
- Epistemic type: ${item.epistemicType}
- Page: ./knowledge/${item.id}/index.html

Summary: ${item.summary}

Statement: ${item.statement}
${item.formula ? `\nFormula: ${item.formula}\n` : ""}
Assumptions:
${item.assumptions.map((value) => `- ${value}`).join("\n")}

Does not imply:
${item.doesNotImply.map((value) => `- ${value}`).join("\n")}

Engineering implications:
${item.engineeringImplications.map((value) => `- ${value}`).join("\n") || "- None declared."}

Sources:
${item.sources.map((source) => `- ${source.url ? `[${source.label}](${source.url})` : source.label}`).join("\n") || "- No external source declared."}
`,
    )
    .join("\n");

  const caseText = [
    ...cases.map((item) => ({ ...item, atlasStatus: "executable" })),
    ...planned.map((item) => ({ ...item, atlasStatus: "planned" })),
  ]
    .map(
      (item) => `## ${item.title}

- ID: ${item.id}
- Status: ${item.atlasStatus}
- Category: ${item.category}
${item.atlasStatus === "executable" ? `- Page: ./cases/${item.id}/index.html\n` : ""}
${item.subtitle}

${item.hook}

Knowledge used: ${(item.knowledge || []).join(", ")}
`,
    )
    .join("\n");

  return `# Knowledge Atlas — full corpus

This document is generated from the structured source objects. Field boundaries are intentional: assumptions and non-implications constrain how a claim may be used.

# Knowledge objects

${knowledgeText}

# Cases

${caseText}`;
}

await fs.rm(path.join(root, "dist"), { recursive: true, force: true });
await fs.mkdir(path.join(root, "dist"), { recursive: true });
const knowledgeIds = await readJson("content/knowledge/index.json");
const caseIds = await readJson("content/cases/index.json");
const planned = await readJson("content/planned-cases.json");
const questions = await readJson("content/learning/questions.json");
const guides = await readJson("content/learning/knowledge-guides.json");
const methods = await readJson("content/learning/methods.json");
const knowledge = [];
const knowledgeById = new Map();
for (const id of knowledgeIds) {
  const k = await readJson(`content/knowledge/${id}.json`);
  knowledge.push(k);
  knowledgeById.set(id, k);
}
const cases = [];
for (const id of caseIds) {
  cases.push(await readJson(`content/cases/${id}/case.json`));
}

await write("dist/index.html", renderHome({ questions, knowledgeById }));
await write("dist/paths/index.html", renderPaths({ questions, knowledge }));
for (const question of questions)
  await write(
    `dist/questions/${question.id}/index.html`,
    renderQuestion({ question, knowledge }),
  );
await write(
  "dist/community/index.html",
  renderCommunity({ questions, knowledge }),
);
await write("dist/notebook/index.html", renderNotebook());
await write("dist/practice/index.html", renderPractice());
for (const kind of ["parallel", "causal"])
  await write(`dist/practice/${kind}/index.html`, renderExperiment({ kind }));
await write("dist/contribute/index.html", renderContribute({ methods }));
await write(
  "dist/explore/index.html",
  renderExplore({ cases, planned, knowledge, questions }),
);
await write(
  "dist/knowledge/index.html",
  renderWikiIndex({ knowledge, guides }),
);
for (const k of knowledge) {
  const usedByCases = [
    ...cases,
    ...planned.map((c) => ({ ...c, status: "planned" })),
  ].filter((c) => (c.knowledge || []).includes(k.id));
  await write(
    `dist/knowledge/${k.id}/index.html`,
    renderWiki({ knowledge: k, guides, questions }),
  );
}
for (const c of cases) {
  await write(
    `dist/cases/${c.id}/index.html`,
    renderCase({
      caseData: c,
      knowledge: c.knowledge.map((id) => knowledgeById.get(id)),
    }),
  );
}

// Machine-readable public registry for future client-side Atlas views and Agent Providers.
const relations = [
  ...cases.map((c) => ({ ...c, atlasStatus: "published" })),
  ...planned.map((c) => ({ ...c, atlasStatus: "planned" })),
].flatMap((c) =>
  (c.knowledge || []).map((knowledgeId) => ({
    type: "USES",
    source: `case:${c.id}`,
    target: `knowledge:${knowledgeId}`,
    caseStatus: c.atlasStatus,
  })),
);

await write(
  "dist/data/registry.json",
  JSON.stringify(
    {
      schemaVersion: 2,
      questions,
      methods,
      cases: cases.map((c) => ({
        id: c.id,
        version: c.version,
        status: c.status,
        category: c.category,
        title: c.title,
        subtitle: c.subtitle,
        knowledge: c.knowledge,
        runtime: c.runtime,
      })),
      knowledge: knowledge.map((k) => ({
        id: k.id,
        status: k.status,
        title: k.title,
        titleZh: k.titleZh,
        epistemicType: k.epistemicType,
        summary: k.summary,
      })),
      plannedCases: planned,
      relations,
    },
    null,
    2,
  ),
);
await write(
  "dist/data/agent-context.json",
  JSON.stringify(
    {
      schemaVersion: 1,
      description:
        "A question-driven, open learning community for guided understanding, science communication, reproducible practice and collaborative knowledge.",
      questions,
      learningMethods: methods,
      guidance: [
        "Preserve epistemicType when characterizing a claim.",
        "Treat assumptions and doesNotImply as hard interpretation boundaries.",
        "Cite object ids and public page paths in answers.",
        "Case Environment owns truth and permissions; an Agent Provider only chooses actions.",
      ],
      knowledge,
      cases,
      plannedCases: planned.map((c) => ({ ...c, status: "planned" })),
      relations,
    },
    null,
    2,
  ),
);
for (const c of cases)
  await write(`dist/data/cases/${c.id}.json`, JSON.stringify(c, null, 2));
for (const k of knowledge)
  await write(`dist/data/knowledge/${k.id}.json`, JSON.stringify(k, null, 2));

await write("dist/llms-full.txt", llmsFull({ cases, planned, knowledge }));

await write("dist/method/index.html", renderMethods({ methods }));
await write(
  "dist/data/learning.json",
  JSON.stringify({ questions, guides, methods }, null, 2),
);
await write(
  "dist/llms.txt",
  `# 知图 · Knowledge Atlas\n\n从问题出发，逐步理解、实践验证、自由探讨与共建的学习平台。\n\n- [学习路径](./paths/index.html)\n- [知识百科](./knowledge/index.html)\n- [实践实验](./practice/index.html)\n- [学习方法与检查标准](./method/index.html)\n- [结构化内容](./data/learning.json)\n- [完整语料](./llms-full.txt)\n\n知识认知状态、假设与边界必须保留。教学模型不等于现实测量；脚本 Agent 不等于在线 LLM；阅读记录不等于掌握。自由讨论和待审提案不会自动成为正文。\n`,
);
await write(
  "dist/llms-full.txt",
  llmsFull({ cases, planned, knowledge }) +
    "\n\n# 问题导学与学习方法\n\n" +
    JSON.stringify({ questions, methods }, null, 2),
);
await copyDir("site/assets", "dist/assets");
await bundle({
  entryPoints: [path.join(root, "site/assets/explorer.js")],
  outfile: path.join(root, "dist/assets/explorer.js"),
  bundle: true,
  format: "esm",
  target: ["es2022"],
  minify: true,
  legalComments: "none",
  logLevel: "silent",
});
await copyDir("site/runtime", "dist/runtime");
const catalog = Object.fromEntries([
  ...knowledge.map((k) => [
    `knowledge:${k.id}`,
    {
      version: k.version,
      title: k.titleZh,
      summary: k.summary,
      statement: k.statement,
      ...guides[k.id],
      revisionHistory: k.revisionHistory || [],
    },
  ]),
  ...questions.map((q) => [
    `question:${q.id}`,
    { version: q.version, title: q.title },
  ]),
  ...["parallel", "causal", "agent"].map((id) => [
    `practice:${id}`,
    { version: 1, title: id },
  ]),
]);
await write(".generated/catalog.json", JSON.stringify(catalog));
await bundle({
  entryPoints: [path.join(root, "server/worker.mjs")],
  outfile: path.join(root, "dist/server/index.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  minify: true,
  logLevel: "silent",
});
await copyDir("site/assets", "dist/client/assets");
await copyDir("site/runtime", "dist/client/runtime");
// A Worker build keeps public assets in dist/client; GitHub Pages remains a read-only export.
for (const name of [
  "index.html",
  "paths",
  "questions",
  "knowledge",
  "community",
  "notebook",
  "practice",
  "contribute",
  "method",
  "explore",
  "cases",
  "data",
  "llms.txt",
  "llms-full.txt",
]) {
  const source = path.join(root, "dist", name),
    dest = path.join(root, "dist/client", name);
  await fs.cp(source, dest, { recursive: true });
}
await fs.copyFile(
  path.join(root, "dist/assets/explorer.js"),
  path.join(root, "dist/client/assets/explorer.js"),
);
await write(
  "dist/.openai/hosting.json",
  JSON.stringify(await readJson(".openai/hosting.json"), null, 2),
);
await write("dist/.nojekyll", "");
console.log(
  `Built platform: ${questions.length} guided questions, ${knowledge.length} wiki articles, 3 experiments, community, notebook and authoring methods.`,
);
