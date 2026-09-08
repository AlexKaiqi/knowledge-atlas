import { icon } from "./icons.mjs";
export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
export function scriptJson(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}
const labels = {
  FORMAL_RESULT: "形式结论",
  FORMAL_MODEL: "数学模型",
  CONCEPTUAL_LAW: "概念规律",
  ENGINEERING_POLICY: "工程策略",
  HEURISTIC: "启发式",
  EMPIRICAL_FINDING: "经验发现",
  SYSTEMS_THEORY: "系统理论",
  EMPIRICAL_HEURISTIC: "经验假设",
  ENGINEERING_METHOD: "工程方法",
  ENGINEERING_PATTERN: "工程模式",
};
export function badge(type) {
  return `<span class="tag">${escapeHtml(labels[type] || type)}</span>`;
}
export function shell({
  title = "知图 · Knowledge Atlas",
  body,
  root = "./",
  active = "home",
  description = "从一个好问题出发。逐步理解、动手验证、自由探讨，一起把知识变得更清楚。",
}) {
  const items = [
    ["home", "compass", "探索工作区", "index.html"],
    ["paths", "route", "学习路径", "paths/index.html"],
    ["knowledge", "book", "知识百科", "knowledge/index.html"],
    ["practice", "flask", "实践实验", "practice/index.html"],
    ["community", "chat", "探讨与共建", "community/index.html"],
  ];
  const current =
    items.find((i) => i[0] === active)?.[2] ||
    {
      notebook: "我的学习",
      method: "学习与共建方法",
      explore: "知识关系图",
      contribute: "参与共建",
      problems: "实践实验",
    }[active] ||
    "发现问题";
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escapeHtml(description)}"><meta name="theme-color" content="#f8f9f5"><title>${escapeHtml(title)}</title><link rel="icon" type="image/svg+xml" href="${root}assets/favicon.svg"><link rel="stylesheet" href="${root}assets/platform.css">${["explore", "problems"].includes(active) ? `<link rel="stylesheet" href="${root}assets/legacy.css">` : ""}</head><body data-page="${active}" data-root="${root}"><a class="skip-link" href="#main">跳到内容</a><aside class="sidebar" id="navigation"><a class="brand" href="${root}index.html"><span class="brand-mark">${icon("compass")}</span><span><strong>知图<span class="brand-point">.</span></strong><small>KNOWLEDGE ATLAS</small></span></a><div class="sidebar-label">一个开放的学习空间</div><nav aria-label="主导航">${items.map(([id, i, t, h]) => `<a class="nav-item ${active === id ? "active" : ""}" ${active === id ? 'aria-current="page"' : ""} href="${root}${h}">${icon(i)}<span>${t}</span>${active === id ? "<i></i>" : ""}</a>`).join("")}</nav><div class="nav-divider"></div><a class="nav-item ${active === "notebook" ? "active" : ""}" href="${root}notebook/index.html">${icon("notebook")}我的学习</a><a class="nav-item ${active === "explore" ? "active" : ""}" href="${root}map/index.html">${icon("graph")}知识关系图</a><div class="sidebar-bottom"><div class="garden-note">${icon("layers")}<p>知识会生长。<br>你的问题也是它的一部分。</p><a href="${root}contribute/index.html">一起共建 ${icon("arrow")}</a></div><a class="quiet-link" href="${root}method/index.html">我们的学习方法 ${icon("arrowUp")}</a><a class="profile" href="${root}notebook/index.html"><span class="avatar">我</span><span><b>保持好奇</b><small>从你所在的地方开始</small></span></a></div></aside><div class="app"><header class="topbar"><div class="breadcrumb"><button class="icon-button mobile-menu" data-menu aria-label="展开导航" aria-expanded="false" aria-controls="navigation">${icon("menu")}</button><span>学习空间</span><span class="slash">/</span><b>${current}</b></div><div class="topbar-right"><span class="open-label"><i></i>开放知识 · 持续生长</span><a class="button small" href="${root}index.html">${icon("plus")}提出问题</a></div></header><main id="main">${body}</main><footer class="footer"><span>让好奇有去处，让理解有依据。</span><div><a href="${root}method/index.html">方法与原则</a><a href="${root}contribute/index.html">共建指南</a><a href="https://github.com/AlexKaiqi/knowledge-atlas" target="_blank" rel="noreferrer">源代码 ↗</a></div></footer></div><div class="toast" data-toast role="status" hidden></div><script type="module" src="${root}assets/platform.js"></script></body></html>`;
}
