import { escapeHtml as e } from "./html.mjs";
import { icon } from "./icons.mjs";
export const head = (eyebrow, title, desc) =>
  `<header class="page-heading"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${desc}</p></header>`;
export const list = (items) =>
  `<ul>${items.map((x) => `<li>${e(x)}</li>`).join("")}</ul>`;
export const search = (placeholder = "搜索问题、主题或概念") =>
  `<label class="search-bar">${icon("search")}<span class="sr-only">${placeholder}</span><input type="search" data-search-input placeholder="${placeholder}"></label>`;
export const chips = (ids, knowledge, root) =>
  `<div class="tag-row">${ids.map((id) => `<a class="tag" href="${root}knowledge/${id}/index.html">${e(knowledge.find((k) => k.id === id)?.titleZh || id)} ↗</a>`).join("")}</div>`;
export const kinds = {
  question: "提个问题",
  idea: "自由探讨",
  evidence: "补充证据",
  experiment: "实践发现",
};
export function choices(q, name) {
  return `<fieldset class="choices" style="border:0;padding:0"><legend class="sr-only">${e(q.prompt)}</legend>${q.choices.map((c, i) => `<label class="choice"><input type="radio" name="${name}" value="${i}" required><span>${e(c)}</span></label>`).join("")}</fieldset>`;
}
