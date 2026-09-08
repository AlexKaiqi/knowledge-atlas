import fs from "node:fs/promises";
import path from "node:path";
const [input, destination] = process.argv.slice(2);
if (!input || !destination)
  throw new Error(
    "Usage: npm run export:knowledge -- <knowledge.json> <destination>",
  );
const data = JSON.parse(await fs.readFile(input, "utf8"));
if (
  data.format !== "knowledge-atlas/knowledge-1" ||
  !/^[a-f0-9-]{36}$/.test(data.document?.id) ||
  !Array.isArray(data.versions) ||
  !data.versions.length
)
  throw new Error("Not a knowledge export.");
const versions = data.versions;
if (
  versions.some(
    (v) =>
      !Number.isSafeInteger(v.version) ||
      v.version < 1 ||
      typeof v.body !== "string",
  ) ||
  new Set(versions.map((v) => v.version)).size !== versions.length
)
  throw new Error("Invalid revisions.");
const current = versions.find((v) => v.version === data.document.version);
if (!current) throw new Error("Current revision missing.");
const base = path.resolve(destination, "knowledge", data.document.id);
await fs.mkdir(path.dirname(base), { recursive: true });
await fs.mkdir(base); // Existing exports are never overwritten.
await fs.mkdir(path.join(base, "revisions"));
const json = (value) => JSON.stringify(value, null, 2) + "\n";
await fs.writeFile(path.join(base, "index.md"), current.body + "\n", {
  flag: "wx",
});
await fs.writeFile(
  path.join(base, "metadata.json"),
  json({
    document: data.document,
    provenance: data.provenance,
    relations: data.relations,
  }),
  { flag: "wx" },
);
for (const v of versions) {
  const { body, ...metadata } = v;
  await fs.writeFile(
    path.join(base, "revisions", `${v.version}.md`),
    body + "\n",
    { flag: "wx" },
  );
  await fs.writeFile(
    path.join(base, "revisions", `${v.version}.json`),
    json({
      ...metadata,
      relations: (data.relationsByVersion || []).filter(
        (r) => r.version === v.version,
      ),
    }),
    { flag: "wx" },
  );
}
console.log(`Exported ${versions.length} permitted revision(s) to ${base}`);
