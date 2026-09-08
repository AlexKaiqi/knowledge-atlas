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
export function renderWikiIndex({ knowledge, guides }) {
  return shell({
    title: "知识百科 · 知图",
    root: "../",
    active: "knowledge",
    body: `<div class="page">${head("A LIVING WIKI", "理解可以从这里生长。", "从直觉翻到原理，从结论追到来源。每个条目都保留适用条件，也欢迎新的例子和有依据的异议。")}${search("搜索知识名称、问题或解释")}<section class="section"><div class="section-title"><h2>从共同探索中沉淀</h2><a href="../index.html">开始探索 →</a></div><div class="wiki-list" data-service-knowledge><p class="muted">正在读取知识草稿与新修订…</p></div></section><div class="section-title section"><span class="meta">${knowledge.length} 个条目 · 均附来源与边界</span><a href="../contribute/index.html">补充一个知识点 ${icon("plus")}</a></div><div class="wiki-list">${knowledge.map((k) => `<a class="wiki-row" href="${k.id}/index.html" data-search-item data-search="${e(k.titleZh + " " + k.title + " " + k.summary + " " + guides[k.id]?.question)}"><div>${badge(k.epistemicType)}<h2>${e(k.titleZh)} <small>${e(k.title)}</small></h2><p>${e(guides[k.id]?.question || k.summary)}</p></div>${icon("arrow")}</a>`).join("")}</div><p class="empty-state" data-search-empty hidden>暂时没有匹配条目。欢迎提出你想理解的概念。</p></div>`,
  });
}
