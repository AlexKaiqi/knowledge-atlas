import fs from 'node:fs/promises';
import path from 'node:path';
import { root, readJson, write } from './lib.mjs';
import {validateLearning} from './learning-contract.mjs';

const id = process.argv[2];
if (!id || !/^[a-z0-9-]+$/.test(id)) {
  console.error('Usage: npm run publish:knowledge -- <knowledge-id>');
  process.exit(1);
}
const rel = `content/knowledge/${id}.json`;
try { await fs.access(path.join(root, rel)); } catch { console.error(`Unknown knowledge object: ${id}`); process.exit(1); }
const item = await readJson(rel);
const guides=await readJson('content/learning/knowledge-guides.json');
const existing=await readJson('content/knowledge/index.json');
const knowledge=await Promise.all(existing.filter(x=>x!==id).map(x=>readJson(`content/knowledge/${x}.json`)));
const errors=validateLearning({questions:await readJson('content/learning/questions.json'),knowledge:[...knowledge,item],guides,methods:await readJson('content/learning/methods.json')});
if(errors.length){console.error('Publication stopped before modifying files:\n- '+errors.join('\n- '));process.exit(1);}
item.status = 'published';
const index = await readJson('content/knowledge/index.json');
if (!index.includes(id)) index.push(id);
await write(rel, JSON.stringify(item, null, 2) + '\n');
await write('content/knowledge/index.json', JSON.stringify(index, null, 2) + '\n');
console.log(`Published Knowledge: ${id}`);
console.log('Run `npm run check` before committing.');
