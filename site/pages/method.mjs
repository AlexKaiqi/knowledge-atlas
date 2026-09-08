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
export function renderMethods({ methods: m }) {
  return shell({
    title: "学习与共建方法 · 知图",
    root: "../",
    active: "method",
    body: `<div class="page">${head("HOW WE LEARN & BUILD", "好的学习方法，也应该可以被检查。", "从问题出发，有帮助地探索，用证据修正理解。这里公开我们的设计依据、适用边界，以及新知识应怎样判断方法是否适用。")}<div class="two-columns"><article class="reading"><blockquote><p>引导与自由探索并行；知识、实践与讨论互相连接。AI 帮助我们提问与理解，学习者仍然负责思考与判断。</p></blockquote>${m.principles.map((p) => `<section id="${p.id}" class="method-card">${icon(p.icon)}<div><h3>${p.title}</h3><p>${p.description}</p><p><small>${p.boundary}</small></p><div class="tag-row">${p.sources.map((id) => `<a href="#source-${id}">${e(m.sources.find((s) => s.id === id).title.split(" · ")[0])}</a>`).join("")}</div></div></section>`).join("")}<section id="checklist"><h2>方法按需选择，审阅说明理由</h2><p>正文没有固定层数或题型。Agent 或人记录“满足、需改进、不适用”及理由；结构检查、内容审阅与真人试学分别标注。</p><ol class="checklist">${m.checklist.map((c, i) => `<li><span class="step-number">${String(i + 1).padStart(2, "0")}</span><div><h4>${c.title}</h4><p><small>程序检查：${c.automatic}</small><br>${c.human}</p></div></li>`).join("")}</ol></section><section id="evidence"><h2>研究证据与设计借鉴</h2><p>调研于 ${m.reviewedAt}。课程设计、产品功能、作者主张与学习效果研究分别标注；下面的来源不能直接证明本平台已经有效。</p>${m.sources.map((s) => `<section id="source-${s.id}" class="thread-card"><span class="tag">${s.type}</span><h3><a href="${s.url}" target="_blank" rel="noreferrer">${s.title} ↗</a></h3><p>${s.finding}</p><p><small>证据边界：${s.limit}</small></p></section>`).join("")}</section><section><h2>怎样判断这个平台是否有帮助？</h2><p>我们需要目标读者独立走通路径，观察卡点、解释中的误解与提示需求，再通过换情境任务和延后回忆检查理解。目前的新导学尚未完成真实学习者试学；访问量、点击次数和阅读完成不能替代学习证据。</p></section></article><aside class="toc"><h3>方法也在持续改进</h3>${m.principles.map((p) => `<a href="#${p.id}">${p.title}</a>`).join("")}<a href="#checklist">新知识检查表</a><a href="#evidence">参考来源与边界</a><a href="../contribute/index.html">参与完善这些方法 ${icon("arrow")}</a></aside></div></div>`,
  });
}
