import fs from "node:fs/promises";
import path from "node:path";
import { build as bundle } from "esbuild";
import { root, readJson, write, copyDir } from "./lib.mjs";
import { renderWorkspace } from "../site/pages/workspace.mjs";
import { renderWithAgent } from "../site/pages/with-agent.mjs";
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
  const raw = await readJson(`content/knowledge/${id}.json`);
  const k = {
    assumptions: [],
    doesNotImply: [],
    engineeringImplications: [],
    sources: [],
    statement: raw.body || raw.summary,
    titleZh: raw.title,
    epistemicType: "待进一步理解",
    ...raw,
  };
  knowledge.push(k);
  knowledgeById.set(id, k);
}
const cases = [];
for (const id of caseIds) {
  cases.push(await readJson(`content/cases/${id}/case.json`));
}

await write("dist/index.html", renderWorkspace({ knowledge, guides, questions }));
// A reviewed public starter. SQL environment drafts never enter the build output.
const pythonBase = await fs.readFile(path.join(root, "environments/python-stdlib/Dockerfile"), "utf8");
await write("dist/data/environment-starters.json", JSON.stringify({
  python: { files: [
    { path: "Dockerfile", content: pythonBase.replace('CMD ["python", "--version"]', 'COPY --chown=explorer:explorer run.py /workspace/run.py\nCMD ["python", "/workspace/run.py"]') },
    { path: "run.py", content: '"""可运行起点；请按实验需求替换示例。"""\nimport json\nfrom random import Random\n\nrng = Random(42)\nheads = sum(rng.random() < 0.5 for _ in range(1000))\nprint(json.dumps({"seed": 42, "trials": 1000, "heads": heads}))\n' },
    { path: "README.md", content: '# 实验环境草稿\n\n这是 Python 标准库起点，run.py 暂为抛硬币示例，尚未按你的问题实现实验。请继续补充依赖、输入和运行说明。\n\n检查文件后，在此目录构建：\n\n    docker build -t atlas-experiment .\n    docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges --memory 128m --cpus 1 --pids-limit 64 atlas-experiment\n\n每次运行在独立记录中保留输入、命令、镜像摘要和平台、输出、退出状态与解释。数据和成果另存；不往包内放账号、密钥和私人数据。\n\n此定义尚未运行。请把实际检验记录写入新的文本文件后提交新版本。\n' }
  ] },
  blank: { files: [{ path: "README.md", content: '# 实验环境草稿\n\n按实验需要补充环境定义、依赖、输入、运行方式与数据位置。可以由参与者或自己的 Agent 继续构建，不要求使用固定文件结构。\n\n当前只有草稿，尚未具备可运行入口，也未执行。\n' }] }
}, null, 2));
await write("dist/with-agent/index.html", renderWithAgent());
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
await write("dist/practice/index.html", renderPractice({ knowledge, guides, questions }));
for (const kind of ["parallel", "causal"])
  await write(`dist/practice/${kind}/index.html`, renderExperiment({ kind }));
await write("dist/contribute/index.html", renderContribute({ methods }));
await write(
  "dist/map/index.html",
  renderExplore({ cases, planned, knowledge, questions }),
);
await write(
  "dist/knowledge/index.html",
  renderWikiIndex({ knowledge, guides, questions }),
);
for (const k of knowledge) {
  const usedByCases = [
    ...cases,
    ...planned.map((c) => ({ ...c, status: "planned" })),
  ].filter((c) => (c.knowledge || []).includes(k.id));
  await write(
    `dist/knowledge/${k.id}/index.html`,
    renderWiki({ knowledge: k, knowledgeCatalog: knowledge, guides, questions }),
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
        "A question-driven knowledge and exploration repository with optional collaboration services. Use existing agents through repository Skills; this project does not implement an agent runtime.",
      questions,
      learningMethods: methods,
      guidance: [
        "For repository work, read AGENTS.md and .agents/skills/knowledge-atlas/SKILL.md in the clone. This published corpus contains seed content, not private service records or the new Git knowledge directory.",
        "Preserve epistemicType when characterizing a claim.",
        "Treat assumptions and doesNotImply as hard interpretation boundaries.",
        "Cite object ids and public page paths in answers.",
        "For existing scripted teaching Cases only: the Case Environment owns truth and permissions; the scripted provider chooses actions.",
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

await write(
  "dist/explore/index.html",
  renderWorkspace({ root: "../", knowledge, guides, questions }),
);
await write("dist/method/index.html", renderMethods({ methods }));
await write(
  "dist/data/learning.json",
  JSON.stringify({ questions, guides, methods }, null, 2),
);
await write(
  "dist/llms.txt",
  `# 知图 · Knowledge Atlas\n\n从问题出发，逐步理解、实践验证、自由探讨与共建的学习项目。用户可以 clone 后用自己的 Agent，通过仓库 .agents/skills/knowledge-atlas/SKILL.md 接手；本项目不自研全套 Agent。\n\n- [项目仓库与接手说明](https://github.com/AlexKaiqi/knowledge-atlas)\n- [学习路径](./paths/index.html)\n- [知识百科](./knowledge/index.html)\n- [实践实验](./practice/index.html)\n- [学习方法与检查标准](./method/index.html)\n- [结构化内容](./data/learning.json)\n- [完整语料](./llms-full.txt)\n\n知识认知状态、假设与边界必须保留。教学模型不等于现实测量；脚本 Agent 不等于在线 LLM；阅读记录不等于掌握。自由讨论和待审提案不会自动成为正文。\n`,
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
for (const folder of ["dist/assets/vendor", "dist/client/assets/vendor"]) {
  await fs.mkdir(path.join(root, folder), { recursive: true });
  await fs.copyFile(path.join(root, "node_modules/@agent-infra/browser-ui/dist/bundle/index.js"), path.join(root, folder, "browser-ui.js"));
  await fs.copyFile(path.join(root, "node_modules/@agent-infra/browser-ui/dist/bundle/index.js.LICENSE.txt"), path.join(root, folder, "browser-ui.LICENSE.txt"));
}

// A Worker build keeps public assets in dist/client; GitHub Pages remains a read-only export.
for (const name of [
  "index.html",
  "paths",
  "questions",
  "knowledge",
  "community",
  "notebook",
  "practice",
  "with-agent",
  "contribute",
  "method",
  "explore",
  "map",
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
