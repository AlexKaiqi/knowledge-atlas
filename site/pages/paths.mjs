import {
  shell,
  escapeHtml as e,
  scriptJson,
  badge,
} from "../components/html.mjs";
import { icon } from "../components/icons.mjs";
import {
  head,
  list,
  search,
  chips,
  kinds,
  choices,
} from "../components/learning.mjs";
import { questionCard } from "./home.mjs";
export function renderPaths({ questions, knowledge }) {
  const themes = [
    [
      "AI 与判断",
      "让判断有依据",
      "从可信的答案，到可靠的验证。",
      "green",
      "check",
    ],
    [
      "思考与推理",
      "把“为什么”想得更清楚",
      "从寻找关联，到设计能区分解释的检查。",
      "blue",
      "graph",
    ],
    [
      "系统与协作",
      "理解复杂事物如何运转",
      "从局部速度，到完整且可检验的成果。",
      "orange",
      "route",
    ],
  ];
  return shell({
    title: "学习路径 · 知图",
    root: "../",
    active: "paths",
    body: `<div class="page">${head("CHOOSE YOUR OWN PATH", "沿着好奇，往前一步。", "每条路径围绕一组有关联的问题。按顺序探索，或跳到你最在意的地方。")}<div class="three-grid">${themes
      .map(
        ([cat, t, d, color, i], idx) =>
          `<section class="path-card"><span class="topic-icon ${color}">${icon(i)}</span><h2>${t}</h2><p>${d}</p><span class="tag">${questions.filter((q) => q.category === cat).length} 个问题 · 自由跳读</span><ol class="path-steps">${questions
            .filter((q) => q.category === cat)
            .map(
              (q, j) =>
                `<li><span>0${j + 1}</span><a href="../questions/${q.id}/index.html">${e(q.title)}</a></li>`,
            )
            .join("")}</ol></section>`,
      )
      .join(
        "",
      )}</div><section class="section">${head("QUESTION LIBRARY", "找一个你想弄明白的问题", "所有路径都提供解释、提示与反馈；完成记录不会自动等于掌握。")}${search()}<div class="filter-row section"><button class="filter active" data-filter="all" aria-pressed="true">全部</button>${themes.map((t) => `<button class="filter" data-filter="${t[0]}" aria-pressed="false">${t[0]}</button>`).join("")}</div><div class="question-grid">${questions.map((q) => questionCard(q, "../")).join("")}</div><p class="empty-state" data-search-empty hidden>没有匹配的问题。试试更短的关键词，或到共建区提出你的问题。</p><section class="section" data-knowledge-search hidden><div class="section-title"><h2>相关知识</h2></div><div class="wiki-list">${knowledge.map((k) => `<a class="wiki-row" data-concept-result data-search="${e(k.titleZh + " " + k.title + " " + k.summary)}" href="../knowledge/${k.id}/index.html"><div><h2>${e(k.titleZh)}</h2><p>${e(k.summary)}</p></div>${icon("arrow")}</a>`).join("")}</div></section></section></div>`,
  });
}
