import fs from 'node:fs/promises';
import path from 'node:path';
import { build as bundle } from 'esbuild';
import { root, readJson, write, copyDir } from './lib.mjs';
import { renderHome } from '../site/pages/home.mjs';
import { renderCase } from '../site/pages/case.mjs';
import { renderKnowledgeIndex } from '../site/pages/knowledge-index.mjs';
import { renderKnowledgeDetail } from '../site/pages/knowledge-detail.mjs';
import { renderMethod } from '../site/pages/method.mjs';
import { renderExplore } from '../site/pages/explore.mjs';

function llmsIndex({ cases, planned, knowledge }) {
  return `# Knowledge Atlas

> A problem-driven, executable knowledge project for Agent and systems engineering.

## Start here

- [Interactive Atlas](./explore/index.html): explore Case → Knowledge relationships.
- [Knowledge Registry](./knowledge/index.html): browse every published knowledge object.
- [Method](./method/index.html): understand the content and runtime boundaries.
- [Machine-readable registry](./data/registry.json): discover object ids, routes, and relations.
- [Full Agent context](./data/agent-context.json): structured, field-preserving project context.
- [Full text corpus](./llms-full.txt): all published knowledge and public Case summaries in one document.

## Corpus

- ${knowledge.length} published Knowledge objects.
- ${cases.length} executable Case.
- ${planned.length} planned Cases.

When answering from this Atlas, preserve each object's epistemic type, assumptions, and “does not imply” boundary. Cite the corresponding object page rather than treating every claim as an unqualified fact.
`;
}

function llmsFull({ cases, planned, knowledge }) {
  const knowledgeText = knowledge.map(item => `## ${item.titleZh} (${item.title})

- ID: ${item.id}
- Epistemic type: ${item.epistemicType}
- Page: ./knowledge/${item.id}/index.html

Summary: ${item.summary}

Statement: ${item.statement}
${item.formula ? `\nFormula: ${item.formula}\n` : ''}
Assumptions:
${item.assumptions.map(value => `- ${value}`).join('\n')}

Does not imply:
${item.doesNotImply.map(value => `- ${value}`).join('\n')}

Engineering implications:
${item.engineeringImplications.map(value => `- ${value}`).join('\n') || '- None declared.'}

Sources:
${item.sources.map(source => `- ${source.url ? `[${source.label}](${source.url})` : source.label}`).join('\n') || '- No external source declared.'}
`).join('\n');

  const caseText = [...cases.map(item => ({ ...item, atlasStatus: 'executable' })), ...planned.map(item => ({ ...item, atlasStatus: 'planned' }))].map(item => `## ${item.title}

- ID: ${item.id}
- Status: ${item.atlasStatus}
- Category: ${item.category}
${item.atlasStatus === 'executable' ? `- Page: ./cases/${item.id}/index.html\n` : ''}
${item.subtitle}

${item.hook}

Knowledge used: ${(item.knowledge || []).join(', ')}
`).join('\n');

  return `# Knowledge Atlas — full corpus

This document is generated from the structured source objects. Field boundaries are intentional: assumptions and non-implications constrain how a claim may be used.

# Knowledge objects

${knowledgeText}

# Cases

${caseText}`;
}

await fs.rm(path.join(root,'dist'),{recursive:true,force:true});
await fs.mkdir(path.join(root,'dist'),{recursive:true});
const knowledgeIds=await readJson('content/knowledge/index.json');
const caseIds=await readJson('content/cases/index.json');
const planned=await readJson('content/planned-cases.json');
const knowledge=[];
const knowledgeById=new Map();
for(const id of knowledgeIds){const k=await readJson(`content/knowledge/${id}.json`);knowledge.push(k);knowledgeById.set(id,k);}
const cases=[];
for(const id of caseIds){cases.push(await readJson(`content/cases/${id}/case.json`));}

await write('dist/index.html',renderHome({cases,planned,knowledgeById}));
await write('dist/explore/index.html',renderExplore({cases,planned,knowledge}));
await write('dist/knowledge/index.html',renderKnowledgeIndex({knowledge}));
for(const k of knowledge){
  const usedByCases=[...cases,...planned.map(c=>({...c,status:'planned'}))].filter(c=>(c.knowledge||[]).includes(k.id));
  await write(`dist/knowledge/${k.id}/index.html`,renderKnowledgeDetail({knowledge:k,usedByCases}));
}
for(const c of cases){
  await write(`dist/cases/${c.id}/index.html`,renderCase({caseData:c,knowledge:c.knowledge.map(id=>knowledgeById.get(id))}));
}

// Machine-readable public registry for future client-side Atlas views and Agent Providers.
const relations=[...cases.map(c=>({...c,atlasStatus:'published'})),...planned.map(c=>({...c,atlasStatus:'planned'}))].flatMap(c=>(c.knowledge||[]).map(knowledgeId=>({
  type:'USES',
  source:`case:${c.id}`,
  target:`knowledge:${knowledgeId}`,
  caseStatus:c.atlasStatus
})));

await write('dist/data/registry.json',JSON.stringify({
  schemaVersion:1,
  cases:cases.map(c=>({id:c.id,version:c.version,status:c.status,category:c.category,title:c.title,subtitle:c.subtitle,knowledge:c.knowledge,runtime:c.runtime})),
  knowledge:knowledge.map(k=>({id:k.id,status:k.status,title:k.title,titleZh:k.titleZh,epistemicType:k.epistemicType,summary:k.summary})),
  plannedCases:planned,
  relations
},null,2));
await write('dist/data/agent-context.json',JSON.stringify({
  schemaVersion:1,
  description:'Problem-driven, executable knowledge objects for Agent and systems engineering.',
  guidance:[
    'Preserve epistemicType when characterizing a claim.',
    'Treat assumptions and doesNotImply as hard interpretation boundaries.',
    'Cite object ids and public page paths in answers.',
    'Case Environment owns truth and permissions; an Agent Provider only chooses actions.'
  ],
  knowledge,
  cases,
  plannedCases:planned.map(c=>({...c,status:'planned'})),
  relations
},null,2));
for(const c of cases) await write(`dist/data/cases/${c.id}.json`,JSON.stringify(c,null,2));
for(const k of knowledge) await write(`dist/data/knowledge/${k.id}.json`,JSON.stringify(k,null,2));

await write('dist/llms.txt',llmsIndex({cases,planned,knowledge}));
await write('dist/llms-full.txt',llmsFull({cases,planned,knowledge}));

await write('dist/method/index.html',renderMethod());
await copyDir('site/assets','dist/assets');
await bundle({
  entryPoints:[path.join(root,'site/assets/explorer.js')],
  outfile:path.join(root,'dist/assets/explorer.js'),
  bundle:true,
  format:'esm',
  target:['es2022'],
  minify:true,
  legalComments:'none',
  logLevel:'silent'
});
await copyDir('site/runtime','dist/runtime');
await write('dist/.nojekyll','');
console.log(`Built dist/: ${cases.length} case page(s), ${knowledge.length} knowledge page(s).`);
