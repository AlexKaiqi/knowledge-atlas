// A content protocol, not a universal lesson template. Existing guided-lesson
// components are checked when present. Free-form service documents use Markdown.
export function validateLearning({
  questions = [],
  knowledge = [],
  guides = {},
  methods,
}) {
  const errors = [];
  const text = (v, label) => {
    if (typeof v !== "string" || !v.trim()) errors.push(`${label}: needs text`);
  };
  const ids = new Set(questions.map((q) => q.id)),
    kids = new Set(knowledge.map((k) => k.id));
  if (ids.size !== questions.length)
    errors.push("learning: duplicate question ids");
  const mids = new Set(methods.principles.map((m) => m.id)),
    sids = new Set(methods.sources.map((s) => s.id));
  function quiz(q, label) {
    if (!q) return;
    text(q.prompt, `${label}.prompt`);
    if (q.choices) {
      if (!Array.isArray(q.choices) || q.choices.length < 2)
        errors.push(`${label}: needs at least two choices`);
      if (
        !Number.isInteger(q.answer) ||
        q.answer < 0 ||
        q.answer >= q.choices.length
      )
        errors.push(`${label}: invalid answer index`);
      if (
        !Array.isArray(q.feedback) ||
        q.feedback.length !== q.choices.length ||
        q.feedback.some((x) => typeof x !== "string" || !x.trim())
      )
        errors.push(`${label}: every choice needs explanatory feedback`);
    }
  }
  for (const q of questions) {
    const label = `question/${q.id}`;
    text(q.title, `${label}.title`);
    if (!/^[a-z0-9-]+$/.test(q.id)) errors.push(`${label}: invalid id`);
    if (!Number.isInteger(q.version) || q.version < 1)
      errors.push(`${label}: invalid version`);
    for (const field of ["knowledge", "prerequisites"])
      for (const id of q[field] || [])
        if (!kids.has(id))
          errors.push(`${label}.${field}: missing knowledge ${id}`);
    quiz(q.prediction, `${label}.prediction`);
    quiz(q.transfer, `${label}.transfer`);
    if (q.layers) {
      if (!Array.isArray(q.layers))
        errors.push(`${label}: layers must be an array`);
      else
        q.layers.forEach((l, i) => text(l.text, `${label}.layers[${i}].text`));
    }
    for (const id of q.activity?.knowledge || [])
      if (!kids.has(id)) errors.push(`${label}: missing practice model ${id}`);
    if (
      q.hints &&
      (!Array.isArray(q.hintResponses) ||
        q.hints.length !== q.hintResponses.length ||
        q.hintResponses.some((x) => typeof x !== "string" || !x.trim()))
    )
      errors.push(
        `${label}: every supplied scaffold needs a specific response`,
      );
    if (q.next && !ids.has(q.next))
      errors.push(`${label}: broken next question ${q.next}`);
    if (
      q.reviewStatus &&
      !["editorial-draft", "content-reviewed", "learner-tried"].includes(
        q.reviewStatus,
      )
    )
      errors.push(`${label}: invalid review status`);
    if (
      q.reviewStatus &&
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
    for (const id of q.methods || [])
      if (!mids.has(id)) errors.push(`${label}: unknown method ${id}`);
  }
  for (const k of knowledge) {
    const label = `knowledge/${k.id}`;
    if (!Number.isInteger(k.version) || k.version < 1)
      errors.push(`${label}: needs a version`);
    // A source can be a proof, dataset, reproducible observation or publication.
    // Incomplete knowledge is allowed, with its unresolved status visible.
    if (
      k.status === "published" &&
      !k.sources?.length &&
      !k.evidence?.length &&
      !k.unresolved
    )
      errors.push(
        `${label}: missing sources or explicit unresolved evidence status`,
      );
    for (const s of k.sources || []) {
      text(s.label, `${label}.source`);
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
  for (const id of Object.keys(guides))
    if (!kids.has(id)) errors.push(`guide/${id}: missing knowledge`);
  for (const p of methods.principles) {
    for (const field of ["id", "title", "description", "boundary"])
      text(p[field], `method/${p.id}.${field}`);
    for (const id of p.sources || [])
      if (!sids.has(id)) errors.push(`method/${p.id}: unknown source ${id}`);
  }
  for (const s of methods.sources) {
    for (const field of ["id", "title", "type", "finding", "limit", "url"])
      text(s[field], `source/${s.id}.${field}`);
    try {
      if (new URL(s.url).protocol !== "https:") throw new Error();
    } catch {
      errors.push(`source/${s.id}: source must use HTTPS`);
    }
  }
  for (const c of methods.checklist)
    for (const field of ["id", "title", "automatic", "human"])
      text(c[field], `checklist/${c.id}.${field}`);
  return errors;
}
