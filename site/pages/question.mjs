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
export function renderQuestion({ question: q, knowledge }) {
  const activityLink =
    q.activity.kind === "agent"
      ? "../../cases/tests-green-wrong/index.html"
      : q.activity.kind === "thought"
        ? "#practice"
        : `../../practice/${q.activity.kind}/index.html`;
  const steps = [
    ["predict", "先想一想"],
    ["understand", "逐层理解"],
    ["practice", "动手求证"],
    ["transfer", "换个情境"],
    ["reflect", "留下理解"],
  ];
  return shell({
    title: `${q.title} · 知图`,
    description: q.summary,
    root: "../../",
    active: "paths",
    body: `<div class="page" data-lesson><script type="application/json" data-lesson-data>${scriptJson(q)}</script><a class="back-link" href="../../paths/index.html">← 所有学习路径</a>${head(`${q.category} / ${q.minutes} MIN`, e(q.title), e(q.summary))}<div class="tag-row"><span class="tag">${q.level}</span><span class="tag">自由跳读</span><span class="tag orange">初版导学 · 待试学反馈</span></div><div class="two-columns section"><div><div class="learning-intro"><b>从这个场景开始</b><p>${e(q.scenario)}</p></div><details class="hint"><summary>适合谁？这次能学会什么？</summary><p>${e(q.audience)}</p>${list(q.goals)}${q.prerequisites.length ? `<p>按需补齐背景</p>${chips(q.prerequisites, knowledge, "../../")}` : "<p>不需要预备知识，可以直接开始。</p>"}</details><div class="study-progress"><span data-study-status>留下判断，看看理解会怎样变化。</span><progress data-study-progress value="0" max="3" aria-label="本次学习记录完整度"></progress></div><section id="predict" class="panel lesson-section"><div class="step-head"><span class="step-number">01</span><h2>先说说你的判断</h2></div><p>${e(q.prediction.prompt)}</p><form data-prediction>${choices(q.prediction, "prediction")}<label class="field"><span>你有多确定？</span><select name="confidence"><option value="unsure">还不确定</option><option value="somewhat">有一些把握</option><option value="sure">很有把握</option></select></label><button class="button primary" type="submit">看看这个判断 ${icon("arrow")}</button><div class="feedback" data-prediction-feedback role="status" hidden></div></form><details class="hint"><summary>给我一个提示</summary><p>${e(q.prediction.hint)}</p></details></section><section id="understand" class="lesson-section"><div class="step-head"><span class="step-number">02</span><h2>从直觉，慢慢走向原理</h2></div>${q.layers.map((l, i) => `<details class="layer" ${i === 0 ? "open" : ""}><summary><span>${e(l.label)}</span>${e(l.title)}</summary><div class="layer-content"><p>${e(l.text)}</p><p class="example">${e(l.example)}</p><p class="boundary">理解的边界：${e(l.boundary)}</p></div></details>`).join("")}<div class="section">${chips(q.knowledge, knowledge, "../../")}</div></section><section id="practice" class="panel lesson-section"><div class="step-head"><span class="step-number">03</span><h2>${e(q.activity.title)}</h2></div><span class="tag">${q.activity.kind === "thought" ? "思想练习" : q.activity.kind === "agent" ? "规则驱动的教学 Agent" : "可操作的教学模型"}</span><p>${e(q.activity.prompt)}</p><div class="callout"><b>观察什么</b><br>${e(q.activity.observation)}<br><small>${e(q.activity.boundary)}</small></div>${q.activity.kind === "thought" ? `<label class="field"><span>你的尝试与观察</span><textarea data-practice-note rows="5" placeholder="条件 → 做了什么 → 看到什么 → 还有什么不能确定"></textarea></label>` : `<a class="button primary" href="${activityLink}" target="_blank" rel="noreferrer">打开实验 ${icon("arrowUp")}</a><p><small>实验会在新标签打开，回来继续检验理解。</small></p>`}</section><section id="transfer" class="panel lesson-section"><div class="step-head"><span class="step-number">04</span><h2>换个情境，还能用吗？</h2></div><p>${e(q.transfer.prompt)}</p><form data-transfer>${choices(q.transfer, "transfer")}<button class="button primary" type="submit">检查我的理解</button><div class="feedback" data-transfer-feedback role="status" hidden></div></form></section><section id="reflect" class="panel lesson-section"><div class="step-head"><span class="step-number">05</span><h2>把理解留成自己的话</h2></div><p>${e(q.reflection)}</p><label class="field"><span>我原来以为……现在我认为……</span><textarea rows="5" data-reflection placeholder="什么证据改变了你的想法？还有哪里没有想清楚？"></textarea></label><details class="hint"><summary>怎样检查自己的解释</summary><p>是否说清了因果或机制？是否给出具体例子？是否说明了不适用的情况？可用这些要点自查，页面不会按字数判断你已经掌握。</p></details><label class="field"><span>什么时候再想一想？</span><select data-review-days><option value="1">明天</option><option value="3">3 天后</option><option value="7">一周后</option><option value="0">暂不安排</option></select><small>${e(q.review)}</small></label><div class="actions"><button class="button primary" data-save-lesson>保存到我的学习 ${icon("notebook")}</button><button class="button" data-share-reflection>带着疑问去讨论</button></div><div class="status-line" data-save-status role="status"></div><small>私人作答保存在服务端，仅此浏览器的访问凭据可读取；可以在“我的学习”中导出。</small></section><a class="button" href="../${q.next}/index.html">沿着好奇，继续下一个问题 ${icon("arrow")}</a></div><aside class="toc"><h3>这次探索的路标</h3>${steps.map(([id, t], i) => `<a href="#${id}"><span>0${i + 1}</span>${t}</a>`).join("")}<div class="guide-panel"><h3>${icon("spark")}思考的脚手架</h3><p>卡住时，挑一个问题问自己。这里的提示由编辑编写。</p>${q.hints.map((h, i) => `<details class="hint"><summary>${e(h)}</summary><p>${e(q.hintResponses[i])}</p></details>`).join("")}<button class="button small section" data-ai-prompt>准备 AI 协作材料 ${icon("arrow")}</button><p>带上当前问题、资料与自己的判断，交给你使用的 AI。此处没有连接在线模型。</p><textarea class="text-input" data-ai-output rows="8" aria-label="AI 协作材料" hidden></textarea><button class="inline-link" data-copy-ai hidden>复制材料</button></div><a href="../../community/index.html?target=question:${q.id}">${icon("chat")}围绕这个问题探讨</a><a href="../../contribute/index.html">这个解释可以更好？</a></aside></div></div>`,
  });
}
