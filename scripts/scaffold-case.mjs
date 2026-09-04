import fs from 'node:fs/promises';
import path from 'node:path';
import { root, write } from './lib.mjs';

const id = process.argv[2];
if (!id || !/^[a-z0-9-]+$/.test(id)) {
  console.error('Usage: npm run scaffold:case -- <case-id>');
  process.exit(1);
}

const casePath = path.join(root, `content/cases/${id}/case.json`);
try {
  await fs.access(casePath);
  console.error(`Case already exists: ${id}`);
  process.exit(1);
} catch {}

const manifest = {
  id,
  version: 1,
  status: 'draft',
  category: 'BUILD',
  title: 'TODO：从一个真实问题开始',
  subtitle: 'TODO',
  hook: 'TODO：用户在这个实验里具体可以改变什么，并观察什么？',
  runtime: {
    module: `cases/${id}`,
    provider: 'scripted',
    contractVersion: 1
  },
  knowledge: [],
  problem: {
    task: 'TODO',
    semanticGoal: 'TODO：可观察、可验证的语义目标',
    initialState: 'TODO'
  },
  artifacts: [
    {
      id: 'workspace',
      label: 'WORKSPACE',
      code: 'TODO',
      initial: 'TODO'
    }
  ],
  harnessControls: [
    {
      id: 'exampleControl',
      label: 'TODO Harness control',
      description: 'TODO：这个干预改变了 Agent 的什么可行策略空间？',
      default: false
    }
  ],
  evidence: [
    {
      id: 'observable',
      label: 'Observable evidence',
      description: 'TODO：执行端之外如何判真？'
    }
  ],
  quickPrompts: [
    '请你自己解决这个任务',
    '你如何证明任务已经完成？',
    '反驳你现在拥有的证据'
  ],
  notebook: [
    { type: 'case', title: 'TODO problem' },
    { type: 'harness', title: 'TODO intervention' },
    { type: 'execution', title: 'Run Agent' },
    { type: 'verification', title: 'Verify observable outcome' },
    { type: 'history', title: 'Replay after intervention' },
    { type: 'knowledge', title: 'Explain after observation' }
  ]
};

const runtimeEntry = `import { mountCaseLab } from '../core/agent-lab.js';\nimport { createToolCaseAdapter } from '../core/tool-case.js';\nimport { environment, scriptedProvider } from './${id}-model.js';\n\nconst root = document.querySelector('[data-agent-notebook][data-case-id="${id}"]');\nmountCaseLab(root, createToolCaseAdapter({ environment, provider: scriptedProvider }));\n`;

const runtimeModel = `export const environment = {\n  createInitialState() { return { done: false }; },\n  tools: {\n    inspect: {\n      description: 'TODO tool',\n      readOnly: true,\n      async execute() { return { events: [{ kind: 'warn', text: 'TODO: implement Case Environment tools' }] }; }\n    }\n  },\n  view({ previewHarness, hasRun }) {\n    return {\n      fields: { workspace: 'TODO' },\n      proofs: { observable: { status: hasRun ? 'fail' : 'idle', detail: hasRun ? 'Draft runtime has no verifier yet' : '尚未执行' } },\n      verdict: {\n        harness: { label: hasRun ? 'REJECTED' : 'NOT RUN', ok: hasRun ? 'no' : 'idle' },\n        reality: { label: 'UNKNOWN', ok: 'idle' }\n      },\n      confidence: { percent: 10, detail: 'draft prior' }\n    };\n  }\n};\n\nexport const scriptedProvider = {\n  mode: 'DRAFT SCRIPTED PROVIDER',\n  intro: '这是一个尚未完成的 Case Agent Provider。',\n  preview({ previewHarness }) {\n    return { label: 'TODO strategy', meta: previewHarness.exampleControl ? 'CONTROL ON' : 'CONTROL OFF' };\n  },\n  async run({ callTool, chat }) {\n    chat('这个 draft provider 还没有实现策略。', 'draft');\n    await callTool('inspect');\n  },\n  async respond() { return '先完成 Environment tools / observer / oracle，再设计 Provider 策略。'; }\n};\n`;

await write(`content/cases/${id}/case.json`, JSON.stringify(manifest, null, 2) + '\n');
await write(`site/runtime/cases/${id}.js`, runtimeEntry);
await write(`site/runtime/cases/${id}-model.js`, runtimeModel);
console.log(`Scaffolded draft Case: ${id}`);
console.log(`- content/cases/${id}/case.json`);
console.log(`- site/runtime/cases/${id}.js`);
console.log(`- site/runtime/cases/${id}-model.js`);
console.log('Draft cases are validated but not published until `npm run promote:case -- <id>`.');
