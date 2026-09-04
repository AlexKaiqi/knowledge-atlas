import fs from 'node:fs/promises';
import path from 'node:path';
import { root, readJson, write } from './lib.mjs';

const id = process.argv[2];
if (!id || !/^[a-z0-9-]+$/.test(id)) {
  console.error('Usage: npm run publish:knowledge -- <knowledge-id>');
  process.exit(1);
}
const rel = `content/knowledge/${id}.json`;
try { await fs.access(path.join(root, rel)); } catch { console.error(`Unknown knowledge object: ${id}`); process.exit(1); }
const item = await readJson(rel);
item.status = 'published';
const index = await readJson('content/knowledge/index.json');
if (!index.includes(id)) index.push(id);
await write(rel, JSON.stringify(item, null, 2) + '\n');
await write('content/knowledge/index.json', JSON.stringify(index, null, 2) + '\n');
console.log(`Published Knowledge: ${id}`);
console.log('Run `npm run check` before committing.');
