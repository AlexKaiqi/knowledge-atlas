import fs from 'node:fs/promises';
import path from 'node:path';
import { root, write } from './lib.mjs';

const id = process.argv[2];
if (!id || !/^[a-z0-9-]+$/.test(id)) {
  console.error('Usage: npm run scaffold:knowledge -- <knowledge-id>');
  process.exit(1);
}
const rel = `content/knowledge/${id}.json`;
try {
  await fs.access(path.join(root, rel));
  console.error(`Knowledge object already exists: ${id}`);
  process.exit(1);
} catch {}

const item = {
  id,
  status: 'draft',
  title: 'TODO English title',
  titleZh: 'TODO 中文标题',
  epistemicType: 'ENGINEERING_METHOD',
  summary: 'TODO：一句话说明这个知识对象解决什么问题。',
  statement: 'TODO：先写准确陈述，再写工程推论。',
  assumptions: ['TODO：该结论成立所需的条件'],
  doesNotImply: ['TODO：它不能推出什么'],
  engineeringImplications: ['TODO：工程上可以据此做什么'],
  sources: []
};
await write(rel, JSON.stringify(item, null, 2) + '\n');
console.log(`Scaffolded draft Knowledge: ${id}`);
console.log(`- ${rel}`);
console.log('Draft knowledge is validated but not visible until `npm run publish:knowledge -- <id>`.');
