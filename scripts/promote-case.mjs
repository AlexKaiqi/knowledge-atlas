import fs from 'node:fs/promises';
import path from 'node:path';
import { root, readJson, write } from './lib.mjs';

const id = process.argv[2];
if (!id || !/^[a-z0-9-]+$/.test(id)) {
  console.error('Usage: npm run promote:case -- <case-id>');
  process.exit(1);
}
const rel = `content/cases/${id}/case.json`;
try { await fs.access(path.join(root, rel)); } catch { console.error(`Unknown case: ${id}`); process.exit(1); }
const manifest = await readJson(rel);
manifest.status = 'published';
const index = await readJson('content/cases/index.json');
if (!index.includes(id)) index.push(id);
const planned = await readJson('content/planned-cases.json');
await write(rel, JSON.stringify(manifest, null, 2) + '\n');
await write('content/cases/index.json', JSON.stringify(index, null, 2) + '\n');
await write('content/planned-cases.json', JSON.stringify(planned.filter(item => item.id !== id), null, 2) + '\n');
console.log(`Promoted Case: ${id}`);
console.log('Run `npm run check` before committing.');
