import { readJson } from "./lib.mjs";
import { validateLearning } from "./learning-contract.mjs";
const ids = await readJson("content/knowledge/index.json");
const content = {
  questions: await readJson("content/learning/questions.json"),
  knowledge: await Promise.all(
    ids.map((id) => readJson(`content/knowledge/${id}.json`)),
  ),
  guides: await readJson("content/learning/knowledge-guides.json"),
  methods: await readJson("content/learning/methods.json"),
};
const errors = validateLearning(content);
if (errors.length) {
  console.error("Learning contract failed:\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log(
  `Learning contract OK: ${content.questions.length} guided questions, ${content.knowledge.length} source-backed wiki guides, ${content.methods.checklist.length} review criteria. Protocol checks, content review and learner trials remain separate.`,
);
