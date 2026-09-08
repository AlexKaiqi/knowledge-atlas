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
export function renderCommunity({ questions, knowledge }) {
  return shell({
    title: "探讨与共建 · 知图",
    root: "../",
    active: "community",
    body: `<div class="page">${head("THINKING, TOGETHER", "还没想明白，也可以开口。", "这里容纳问题、不同解释、反例与实践发现。讨论可以开放，沉淀为知识时仍要说明依据和边界。")}<div class="two-columns"><div><div class="section-title"><h2 data-community-heading>自由探讨</h2><button class="button small primary" data-compose>${icon("plus")}发起探讨</button></div><div class="filter-row" role="group" aria-label="讨论类型"><button class="filter active" data-community-filter="all">全部</button>${Object.entries(
      kinds,
    )
      .map(
        ([id, t]) =>
          `<button class="filter" data-community-filter="${id}">${t}</button>`,
      )
      .join(
        "",
      )}</div><div data-discussions><p class="skeleton-text">正在读取共同的讨论空间…</p></div><div class="section"><div class="section-title"><h2>正在完善的解释</h2><a href="../knowledge/index.html">打开百科 ${icon("arrow")}</a></div><div data-revisions><p class="skeleton-text">正在读取修订提案…</p></div></div></div><aside><section class="panel"><h3>一种轻松的开场</h3><p>“我原来认为……，但观察到……。有没有另一种解释？”</p><div class="callout">可以不确定，也可以不同意。把你的理由、观察条件与资料一起带来。</div><a class="quiet-link" href="../contribute/index.html">查看共建指南 ${icon("arrow")}</a></section><section class="guide-panel"><h3>${icon("edit")}从讨论走向知识</h3><p>问题 → 补充证据 → 提出修订 → 审阅 → 进入正文。未解决的争议会保留在讨论中。</p><a href="../method/index.html" class="inline-link">我们的内容检查标准</a></section></aside></div><dialog data-compose-dialog><div class="section-title"><h2>把一个想法放到桌面上</h2><button class="icon-button" data-close-dialog aria-label="关闭">${icon("close")}</button></div><form data-discussion-form><label class="field"><span>这是一条</span><select name="kind">${Object.entries(
      kinds,
    )
      .map(([id, t]) => `<option value="${id}">${t}</option>`)
      .join(
        "",
      )}</select></label><label class="field"><span>关联到哪里</span><select name="target"><option value="general">自由探索 · 暂无特定关联</option><optgroup label="问题">${questions.map((q) => `<option value="question:${q.id}">${e(q.title)}</option>`).join("")}</optgroup><optgroup label="知识">${knowledge.map((k) => `<option value="knowledge:${k.id}">${e(k.titleZh)}</option>`).join("")}</optgroup><optgroup label="实践"><option value="practice:parallel">并行与瓶颈实验</option><option value="practice:causal">相关与因果实验</option><option value="practice:agent">Agent 证据实验</option></optgroup></select></label><label class="field"><span>一句话说清你的问题或发现</span><input name="title" required minlength="2" maxlength="160" placeholder="例如：多个检查共享一个错误来源，怎么识别？"></label><label class="field"><span>你的思考、观察与依据</span><textarea name="body" rows="6" required minlength="2" maxlength="12000" placeholder="可以是疑问、不同解释、反例、资料或实验记录。把不确定的部分也写下来。"></textarea></label><label class="field"><span>你的称呼</span><input name="nickname" maxlength="40" placeholder="好奇的访客"></label><div class="actions"><button class="button primary" type="submit">发布到讨论空间 ${icon("chat")}</button><small>发布后对能够访问本站的人可见。</small></div><p data-discussion-status class="status-line" role="status"></p></form></dialog></div>`,
  });
}
