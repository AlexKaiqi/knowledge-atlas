import fs from 'node:fs/promises';
import path from 'node:path';
import { root, readJson } from './lib.mjs';

const allowedEpistemic = new Set([
  'FORMAL_RESULT',
  'FORMAL_MODEL',
  'SYSTEMS_THEORY',
  'EMPIRICAL_HEURISTIC',
  'CONCEPTUAL_LAW',
  'ENGINEERING_POLICY',
  'ENGINEERING_METHOD',
  'ENGINEERING_PATTERN'
]);
const allowedNotebookCells = new Set(['case', 'harness', 'execution', 'verification', 'history', 'knowledge']);
const requiredNotebookCells = ['case', 'harness', 'execution', 'verification', 'knowledge'];
const errors = [];
const warnings = [];

function uniqueIds(items, label) {
  const ids = items.map(item => item?.id).filter(Boolean);
  if (new Set(ids).size !== ids.length) errors.push(`${label}: duplicate id`);
}

function requireFields(object, fields, label) {
  for (const field of fields) if (!(field in object)) errors.push(`${label}: missing ${field}`);
}

function validId(id) {
  return typeof id === 'string' && /^[a-z0-9-]+$/.test(id);
}

async function listKnowledgeFiles() {
  const entries = await fs.readdir(path.join(root, 'content/knowledge'), { withFileTypes: true });
  return entries.filter(entry => entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'index.json').map(entry => entry.name.replace(/\.json$/, ''));
}

async function listCaseDirs() {
  const entries = await fs.readdir(path.join(root, 'content/cases'), { withFileTypes: true });
  return entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
}

const publishedKnowledgeIds = await readJson('content/knowledge/index.json');
const publishedCaseIds = await readJson('content/cases/index.json');
const planned = await readJson('content/planned-cases.json');
const knowledgeFiles = await listKnowledgeFiles();
const caseDirs = await listCaseDirs();

if (new Set(publishedKnowledgeIds).size !== publishedKnowledgeIds.length) errors.push('knowledge/index.json contains duplicate ids');
if (new Set(publishedCaseIds).size !== publishedCaseIds.length) errors.push('cases/index.json contains duplicate ids');

const knowledge = new Map();
for (const id of knowledgeFiles) {
  const label = `knowledge/${id}`;
  const k = await readJson(`content/knowledge/${id}.json`);
  requireFields(k, ['id', 'status', 'title', 'titleZh', 'epistemicType', 'summary', 'statement', 'assumptions', 'doesNotImply', 'engineeringImplications', 'sources'], label);
  if (k.id !== id) errors.push(`${label}: id mismatch`);
  if (!validId(k.id)) errors.push(`${label}: invalid id`);
  if (!['draft', 'published', 'archived'].includes(k.status)) errors.push(`${label}: invalid status ${k.status}`);
  if (!allowedEpistemic.has(k.epistemicType)) errors.push(`${label}: unsupported epistemicType ${k.epistemicType}`);
  if (!Array.isArray(k.assumptions) || !k.assumptions.length) errors.push(`${label}: assumptions must be non-empty`);
  if (!Array.isArray(k.doesNotImply) || !k.doesNotImply.length) errors.push(`${label}: doesNotImply must be non-empty`);
  if (!Array.isArray(k.engineeringImplications)) errors.push(`${label}: engineeringImplications must be an array`);
  if (!Array.isArray(k.sources)) errors.push(`${label}: sources must be an array`);
  const registered = publishedKnowledgeIds.includes(id);
  if (registered && k.status !== 'published') errors.push(`${label}: listed in knowledge/index.json but status is ${k.status}`);
  if (!registered && k.status === 'published') errors.push(`${label}: status published but missing from knowledge/index.json`);
  knowledge.set(id, k);
}
for (const id of publishedKnowledgeIds) if (!knowledge.has(id)) errors.push(`knowledge/index.json: missing file for ${id}`);

const cases = new Map();
for (const id of caseDirs) {
  const label = `case/${id}`;
  let c;
  try {
    c = await readJson(`content/cases/${id}/case.json`);
  } catch {
    errors.push(`${label}: missing or invalid case.json`);
    continue;
  }
  requireFields(c, ['id', 'version', 'status', 'category', 'title', 'subtitle', 'hook', 'runtime', 'knowledge', 'problem', 'artifacts', 'harnessControls', 'evidence', 'notebook'], label);
  if (c.id !== id) errors.push(`${label}: id mismatch`);
  if (!validId(c.id)) errors.push(`${label}: invalid id`);
  if (!['draft', 'published', 'archived'].includes(c.status)) errors.push(`${label}: invalid status ${c.status}`);
  if (!Number.isInteger(c.version) || c.version < 1) errors.push(`${label}: version must be integer >= 1`);
  if (!c.runtime || typeof c.runtime !== 'object') {
    errors.push(`${label}: runtime must be an object`);
  } else {
    requireFields(c.runtime, ['module', 'provider', 'contractVersion'], `${label}.runtime`);
    if (!/^[a-z0-9/_-]+$/.test(c.runtime.module || '') || String(c.runtime.module).includes('..')) errors.push(`${label}: invalid runtime.module`);
    if (c.runtime.contractVersion !== 1) errors.push(`${label}: unsupported runtime contractVersion ${c.runtime.contractVersion}`);
    try {
      await fs.access(path.join(root, `site/runtime/${c.runtime.module}.js`));
    } catch {
      errors.push(`${label}: missing runtime site/runtime/${c.runtime.module}.js`);
    }
  }
  for (const kid of c.knowledge || []) if (!knowledge.has(kid) || knowledge.get(kid)?.status !== 'published') errors.push(`${label}: broken or unpublished knowledge ref ${kid}`);
  if (!c.problem || typeof c.problem !== 'object') errors.push(`${label}: problem must be an object`);
  else requireFields(c.problem, ['task', 'semanticGoal', 'initialState'], `${label}.problem`);
  if (!Array.isArray(c.artifacts) || !c.artifacts.length) errors.push(`${label}: artifacts must be non-empty`);
  if (!Array.isArray(c.harnessControls)) errors.push(`${label}: harnessControls must be an array`);
  if (!Array.isArray(c.evidence) || !c.evidence.length) errors.push(`${label}: evidence must be non-empty`);
  if (!Array.isArray(c.notebook) || !c.notebook.length) errors.push(`${label}: notebook must be non-empty`);
  uniqueIds(c.artifacts || [], `${label}.artifacts`);
  uniqueIds(c.harnessControls || [], `${label}.harnessControls`);
  uniqueIds(c.evidence || [], `${label}.evidence`);
  for (const item of c.artifacts || []) requireFields(item, ['id', 'label', 'code', 'initial'], `${label}.artifact/${item?.id || '?'}`);
  for (const item of c.harnessControls || []) requireFields(item, ['id', 'label', 'description', 'default'], `${label}.harness/${item?.id || '?'}`);
  for (const item of c.evidence || []) requireFields(item, ['id', 'label', 'description'], `${label}.evidence/${item?.id || '?'}`);
  const cellTypes = (c.notebook || []).map(cell => cell.type);
  for (const type of cellTypes) if (!allowedNotebookCells.has(type)) errors.push(`${label}: unsupported notebook cell ${type}`);
  for (const type of requiredNotebookCells) if (!cellTypes.includes(type)) errors.push(`${label}: notebook missing required ${type} cell`);
  const registered = publishedCaseIds.includes(id);
  if (registered && c.status !== 'published') errors.push(`${label}: listed in cases/index.json but status is ${c.status}`);
  if (!registered && c.status === 'published') errors.push(`${label}: status published but missing from cases/index.json`);
  cases.set(id, c);
}
for (const id of publishedCaseIds) if (!cases.has(id)) errors.push(`cases/index.json: missing case directory for ${id}`);

uniqueIds(planned, 'planned-cases.json');
for (const c of planned) {
  if (!validId(c.id)) errors.push(`planned/${c.id}: invalid id`);
  for (const kid of c.knowledge || []) if (!knowledge.has(kid) || knowledge.get(kid)?.status !== 'published') errors.push(`planned/${c.id}: broken or unpublished knowledge ref ${kid}`);
  if (cases.has(c.id)) warnings.push(`planned/${c.id}: a case directory already exists; remove backlog item when promoted`);
}

// Runtime core is part of the public Case contract.
for (const requiredRuntimeFile of ['site/runtime/core/agent-lab.js', 'site/runtime/core/tool-case.js']) {
  try { await fs.access(path.join(root, requiredRuntimeFile)); }
  catch { errors.push(`runtime core missing: ${requiredRuntimeFile}`); }
}

if (warnings.length) console.warn('Validation warnings:\n- ' + warnings.join('\n- '));
if (errors.length) {
  console.error('Validation failed:\n- ' + errors.join('\n- '));
  process.exit(1);
}
console.log(`Validation OK: ${publishedCaseIds.length} published case(s), ${caseDirs.length - publishedCaseIds.length} non-published case(s), ${planned.length} planned case(s), ${publishedKnowledgeIds.length} published knowledge object(s), ${knowledgeFiles.length - publishedKnowledgeIds.length} non-published knowledge object(s).`);
