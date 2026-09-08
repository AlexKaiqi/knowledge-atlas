// Structural checks complement the human review in docs/KNOWLEDGE_REVIEW.md.
export function validateLearning({ questions, knowledge, guides, methods }) {
  const errors = [];
  const required = (obj, fields, label) => {
    for (const key of fields)
      if (
        typeof obj?.[key] !== "string" ||
        !obj[key].trim() ||
        /TODO|待填写|占位/.test(obj[key])
      )
        errors.push(`${label}.${key}: needs complete text`);
  };
  if (!Array.isArray(questions) || !questions.length)
    return ["learning: questions must be a nonempty array"];
  const ids = new Set(questions.map((q) => q.id)),
    kids = new Set(knowledge.map((k) => k.id));
  if (ids.size !== questions.length)
    errors.push("learning: duplicate question ids");
  const mids = new Set(methods.principles.map((m) => m.id)),
    sids = new Set(methods.sources.map((s) => s.id));
  function quiz(q, label) {
    required(q, ["prompt"], label);
    if (
      !Array.isArray(q?.choices) ||
      q.choices.length < 2 ||
      q.choices.some((c) => typeof c !== "string" || !c.trim())
    )
      errors.push(`${label}: needs at least two choices`);
    if (
      !Number.isInteger(q?.answer) ||
      q.answer < 0 ||
      q.answer >= q?.choices?.length
    )
      errors.push(`${label}: invalid answer index`);
    if (
      !Array.isArray(q?.feedback) ||
      q.feedback.length !== q?.choices?.length ||
      q.feedback.some((x) => typeof x !== "string" || !x.trim())
    )
      errors.push(`${label}: every choice needs explanatory feedback`);
  }
  for (const q of questions) {
    const label = `question/${q.id}`;
    required(
      q,
      [
        "id",
        "title",
        "summary",
        "category",
        "audience",
        "scenario",
        "reflection",
        "review",
        "next",
      ],
      label,
    );
    if (!/^[a-z0-9-]+$/.test(q.id)) errors.push(`${label}: invalid id`);
    if (!Number.isInteger(q.version) || q.version < 1)
      errors.push(`${label}: invalid version`);
    if (!Number.isInteger(q.minutes) || q.minutes < 1)
      errors.push(`${label}: invalid reading duration`);
    if (
      !Array.isArray(q.goals) ||
      !q.goals.length ||
      q.goals.some((x) => typeof x !== "string" || !x.trim())
    )
      errors.push(`${label}: needs observable goals`);
    for (const f of ["knowledge", "prerequisites"]) {
      if (!Array.isArray(q[f])) errors.push(`${label}.${f}: needs an array`);
      else
        for (const id of q[f])
          if (!kids.has(id))
            errors.push(`${label}.${f}: missing knowledge ${id}`);
    }
    if (!q.knowledge?.length) errors.push(`${label}: needs source knowledge`);
    quiz(q.prediction, label + ".prediction");
    required(q.prediction, ["hint"], label + ".prediction");
    quiz(q.transfer, label + ".transfer");
    if (!Array.isArray(q.layers) || q.layers.length < 3)
      errors.push(
        `${label}: needs intuition, mechanism and deeper explanation`,
      );
    else
      q.layers.forEach((l, i) =>
        required(
          l,
          ["label", "title", "text", "example", "boundary"],
          `${label}.layers[${i}]`,
        ),
      );
    required(
      q.activity,
      ["kind", "title", "prompt", "observation", "boundary"],
      label + ".activity",
    );
    if (!["agent", "parallel", "causal", "thought"].includes(q.activity?.kind))
      errors.push(`${label}: unsupported activity runtime`);
    if (!q.activity?.variables?.length)
      errors.push(`${label}: practice needs variable or action choices`);
    for (const id of q.activity?.knowledge || [])
      if (!kids.has(id)) errors.push(`${label}: missing practice model ${id}`);
    if (
      !q.hints?.length ||
      q.hints.length !== q.hintResponses?.length ||
      q.hintResponses.some((x) => typeof x !== "string" || !x.trim())
    )
      errors.push(`${label}: every scaffold needs a specific response`);
    if (!ids.has(q.next))
      errors.push(`${label}: broken next question ${q.next}`);
    if (
      !["editorial-draft", "content-reviewed", "learner-tried"].includes(
        q.reviewStatus,
      )
    )
      errors.push(`${label}: invalid review status`);
    if (
      q.reviewStatus !== "editorial-draft" &&
      (!q.reviewEvidence?.reviewer ||
        !q.reviewEvidence?.date ||
        !q.reviewEvidence?.notes)
    )
      errors.push(
        `${label}: reviewed status requires attributable review evidence`,
      );
    if (q.reviewStatus === "learner-tried" && !q.reviewEvidence?.learnerReport)
      errors.push(`${label}: learner trial requires a report`);
    for (const id of [
      "prediction",
      "scaffolding",
      "self-explanation",
      "retrieval",
      "transfer",
    ])
      if (!q.methods?.includes(id))
        errors.push(`${label}: missing method ${id}`);
    for (const id of q.methods || [])
      if (!mids.has(id)) errors.push(`${label}: unknown method ${id}`);
  }
  for (const k of knowledge) {
    const label = `knowledge/${k.id}`;
    if (!Number.isInteger(k.version) || k.version < 1)
      errors.push(`${label}: needs a version`);
    required(
      guides[k.id],
      ["question", "intuition", "example", "check"],
      label + ".guide",
    );
    if (!k.sources?.length)
      errors.push(
        `${label}: missing sources; incomplete ideas belong in drafts or discussion`,
      );
    for (const s of k.sources || []) {
      required(s, ["label"], label + ".source");
      if (s.url) {
        try {
          if (!["https:", "http:"].includes(new URL(s.url).protocol))
            throw new Error();
        } catch {
          errors.push(`${label}: invalid source URL`);
        }
      }
    }
  }
  for (const p of methods.principles) {
    required(p, ["id", "title", "description", "boundary"], `method/${p.id}`);
    for (const id of p.sources)
      if (!sids.has(id)) errors.push(`method/${p.id}: unknown source ${id}`);
  }
  for (const s of methods.sources) {
    required(
      s,
      ["id", "title", "type", "finding", "limit", "url"],
      `source/${s.id}`,
    );
    try {
      if (new URL(s.url).protocol !== "https:") throw new Error();
    } catch {
      errors.push(`source/${s.id}: source must use HTTPS`);
    }
  }
  for (const c of methods.checklist)
    required(c, ["id", "title", "automatic", "human"], `checklist/${c.id}`);
  return errors;
}
