import fs from 'node:fs/promises';
import path from 'node:path';
import { root } from './lib.mjs';

const dist = path.join(root, 'dist');

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  }));
  return nested.flat();
}

async function exists(target) {
  try {
    const stat = await fs.stat(target);
    if (stat.isDirectory()) await fs.access(path.join(target, 'index.html'));
    return true;
  } catch {
    return false;
  }
}

const files = await walk(dist);
const htmlFiles = files.filter(file => file.endsWith('.html'));
const errors = [];
let checked = 0;

for (const file of htmlFiles) {
  const html = await fs.readFile(file, 'utf8');
  const references = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map(match => match[1]);
  for (const reference of references) {
    if (/^(?:https?:|mailto:|tel:|data:|javascript:|#)/i.test(reference)) continue;
    const clean = reference.split('#')[0].split('?')[0];
    if (!clean) continue;
    const decoded = decodeURIComponent(clean);
    const target = decoded.startsWith('/')
      ? path.join(dist, decoded.replace(/^\/+/, ''))
      : path.resolve(path.dirname(file), decoded);
    checked += 1;
    if (!target.startsWith(dist + path.sep) && target !== dist) {
      errors.push(`${path.relative(root, file)}: path escapes dist (${reference})`);
      continue;
    }
    if (!(await exists(target))) errors.push(`${path.relative(root, file)}: missing ${reference}`);
  }
}

if (errors.length) {
  console.error(`Internal link check failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log(`Internal link check OK: ${checked} local references across ${htmlFiles.length} HTML pages.`);
