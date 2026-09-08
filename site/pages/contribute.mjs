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
export function renderContribute({ methods: m }) {
  return shell({
    title: "参与共建 · 知图",
    root: "../",
    active: "contribute",
    body: `<div class="page">${head("SMALL CONTRIBUTIONS, SHARED UNDERSTANDING", "你不必是专家，才可以贡献。", "一句更清楚的解释、一个不同的例子、一条能复现的观察，都可能帮助下一个人。")}<div class="three-grid">${[
      [
        "chat",
        "从一个问题开始",
        "说出你卡在哪里，或者给出一种不同解释。",
        "../index.html",
        "提出问题",
      ],
      [
        "edit",
        "让一个词条更清楚",
        "选中百科里的核心解释或陈述，比较修改前后，附上理由与来源。",
        "../knowledge/index.html",
        "打开知识百科",
      ],
      [
        "flask",
        "把一次实践分享出来",
        "留下条件、步骤、结果和限制，让其他人能复现或提出不同实验。",
        "../community/index.html?compose=experiment",
        "分享实践",
      ],
    ]
      .map(
        ([i, t, d, h, b]) =>
          `<section class="path-card"><span class="topic-icon">${icon(i)}</span><h2>${t}</h2><p>${d}</p><a class="button small" href="${h}">${b} ${icon("arrow")}</a></section>`,
      )
      .join(
        "",
      )}</div><div class="two-columns section"><section class="panel"><h2>把值得复用的发现沉淀下来</h2><p>你可以先提交未完成的想法。由维护 Agent 判断哪些方法适用并说明理由；下面的自查只作为临时草稿，不代表通过审阅。</p><ul class="checklist" data-author-checklist>${m.checklist.map((c) => `<li><input type="checkbox" id="check-${c.id}"><label for="check-${c.id}"><b>${c.title}</b><br>${c.human}</label></li>`).join("")}</ul><div class="actions"><button class="button primary" data-download-template>下载审阅参考</button><span class="meta" data-checklist-status>尚未自查</span></div></section><aside><section class="guide-panel"><h3>自由贡献与正文发布</h3><p>自由讨论欢迎不完整的想法；知识正文自由组织；依据、范围、未知和修改记录应能追溯。活动与练习按需要提供。</p><p>提案公开保留，维护者审阅后合入内容库。未合入的提案不改变知识正文。</p><a href="../method/index.html#checklist" class="inline-link">检查标准从哪里来？</a></section><section class="panel section"><h3>愿意直接改进项目？</h3><p>内容与页面分开维护。仓库提供内容模板、自动校验和发布规范。</p><a class="button small section" href="https://github.com/AlexKaiqi/knowledge-atlas" target="_blank" rel="noreferrer">打开项目仓库 ↗</a></section></aside></div><script type="application/json" data-methods-data>${scriptJson(m)}</script></div>`,
  });
}
