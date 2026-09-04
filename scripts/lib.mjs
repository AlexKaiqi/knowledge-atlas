import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function readJson(rel){return JSON.parse(await fs.readFile(path.join(root,rel),'utf8'));}
export async function ensureDir(rel){await fs.mkdir(path.join(root,rel),{recursive:true});}
export async function write(rel,data){const p=path.join(root,rel);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,data);}
export async function copyDir(srcRel,dstRel){await fs.cp(path.join(root,srcRel),path.join(root,dstRel),{recursive:true});}
