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
export function renderWiki({ knowledge: k, guides, questions }) {
  const g = guides[k.id] || {
    question: k.summary,
    intuition: k.summary,
    example: "",
    check: "你会怎样用自己的话解释它？还有哪些地方需要查证？",
  };
  const related = questions.filter((q) => q.knowledge?.includes(k.id));
  return shell({
    title: `${k.titleZh} · 知图百科`,
    root: "../../",
    active: "knowledge",
    body: `<div class="page" data-wiki><script type="application/json" data-wiki-data>${scriptJson({ ...k, ...g })}</script><a class="back-link" href="../index.html">← 知识百科</a>${head("KNOWLEDGE, OPEN TO QUESTIONS", e(k.titleZh), e(g.question))}<div class="tag-row">${badge(k.epistemicType)}<span class="tag">正文 v${k.version || 1}</span><span class="meta">${e(k.title)}</span></div><nav class="wiki-tabs" aria-label="词条功能"><a class="active" href="#article">阅读词条</a><a href="#edit">提出修订</a><a href="#history">版本与提案</a><a href="../../community/index.html?target=knowledge:${k.id}">讨论</a></nav><div class="two-columns"><article class="reading" id="article"><section id="intuition"><h2>先建立直觉</h2><p>${e(g.intuition)}</p><blockquote><p>${e(g.example)}</p></blockquote></section><section id="mechanism"><h2>准确地说</h2><p>${e(k.summary)}</p><p>${e(k.statement)}</p>${k.formula ? `<div class="formula">${e(k.formula)}</div>` : ""}</section><section id="boundary"><h2>在哪些条件下成立？</h2>${list(k.assumptions)}<h3>这并不意味着</h3>${list(k.doesNotImply)}</section><section id="use"><h2>怎样用到实践中</h2>${list(k.engineeringImplications)}<div class="callout"><b>合上解释，试着想一想</b><br>${e(g.check)}</div>${related.map((q) => `<p><a href="../../questions/${q.id}/index.html">${e(q.title)} →</a></p>`).join("")}</section><section id="sources"><h2>从哪里继续查证</h2><ul class="source-list">${k.sources.map((s) => `<li>${s.url ? `<a href="${e(s.url)}" target="_blank" rel="noreferrer">${e(s.label)} ↗</a>` : e(s.label)}</li>`).join("")}</ul><p class="muted">来源与原文主张仍欢迎核查。既有参考资料包含二手入口，不能仅凭列出链接认为所有解释已经得到验证。</p></section><section id="edit" class="section panel"><h2>让这个解释更清楚</h2><p>补充例子、纠正措辞，或指出一个边界。提案会公开保留；经过审阅后才进入正文。</p><form data-revision-form><label class="field"><span>修改哪一部分</span><select name="field"><option value="summary">核心解释</option><option value="statement">准确陈述</option><option value="intuition">直觉解释</option><option value="example">具体例子</option><option value="check">自查问题</option></select></label><label class="field"><span>你的修订</span><textarea name="afterText" rows="5" minlength="4" maxlength="10000" required>${e(k.summary)}</textarea></label><div class="editor-grid"><div><small>当前正文</small><div class="diff-box before" data-diff-before>${e(k.summary)}</div></div><div><small>你的版本</small><div class="diff-box after" data-diff-after>${e(k.summary)}</div></div></div><label class="field"><span>为什么这样修改</span><textarea name="reason" rows="2" minlength="4" maxlength="3000" required placeholder="指出原解释的问题，说明修改如何帮助理解"></textarea></label><label class="field"><span>来源或证据说明</span><textarea name="sources" rows="2" minlength="4" maxlength="4000" required placeholder="支持修改的原文链接、出处或可复现观察；措辞建议也请说明依据"></textarea></label><label class="field"><span>你的称呼</span><input name="nickname" maxlength="40" placeholder="好奇的访客"></label><button class="button primary" type="submit">提交修订提案 ${icon("edit")}</button><p class="status-line" data-revision-status role="status"></p></form></section><section id="history"><h2>版本与修订提案</h2><div class="thread-card"><div class="thread-meta"><span class="tag">正文 v${k.version || 1}</span><span>项目内容库</span></div><p>当前公开正文。后续修改保留来源、理由与基础版本，不以提案数量替代事实判断。</p><a href="https://github.com/AlexKaiqi/knowledge-atlas/commits/main/content/knowledge/${k.id}.json" target="_blank" rel="noreferrer">查看源文件历史 ↗</a></div><div data-revisions data-target="knowledge:${k.id}"><p class="skeleton-text">正在读取修订提案…</p></div></section></article><aside class="toc"><h3>这页的线索</h3><a href="#intuition">01 建立直觉</a><a href="#mechanism">02 准确陈述</a><a href="#boundary">03 适用边界</a><a href="#use">04 应用与检验</a><a href="#sources">05 来源与查证</a><a href="#edit">${icon("edit")}提出修订</a><div class="guide-panel"><h3>知识也需要被追问</h3><p>正文、讨论和个人观察保留各自的状态。一个不同意见可以成为更好解释的起点。</p><a class="button small" href="../../community/index.html?target=knowledge:${k.id}">参与词条讨论</a></div></aside></div></div>`,
  });
}
