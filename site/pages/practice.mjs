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
export function renderPractice() {
  return shell({
    title: "实践实验 · 知图",
    root: "../",
    active: "practice",
    body: `<div class="page">${head("LESS GUESSING, MORE EXPLORING", "动一动条件，看看会发生什么。", "先留下预测，再操作和观察。实验既可以验证直觉，也可以帮你找到下一个问题。")}<div class="three-grid">${[
      [
        "agent",
        "check",
        "green",
        "测试通过，目标实现了吗？",
        "改变验收条件，比较教学 Agent 的执行与证据。",
        "../cases/tests-green-wrong/index.html",
        "规则驱动的 Agent",
      ],
      [
        "parallel",
        "route",
        "orange",
        "局部变快，整体会快多少？",
        "调整可加速比例和倍数，观察理想速度的上限。",
        "parallel/index.html",
        "数学教学模型",
      ],
      [
        "causal",
        "graph",
        "blue",
        "带伞的人，更容易被淋湿？",
        "改变天气结构，比较观察与干预的不同结论。",
        "causal/index.html",
        "因果玩具模型",
      ],
    ]
      .map(
        ([id, i, c, t, d, h, label]) =>
          `<a class="path-card" href="${h}"><span class="topic-icon ${c}">${icon(i)}</span><h2>${t}</h2><p>${d}</p><div class="tag-row"><span class="tag">${label}</span>${icon("arrow")}</div></a>`,
      )
      .join(
        "",
      )}</div><div class="callout">模型可以被检查，结论也有边界。每次实验请区分：事先设定的假设、实际算出的结果，以及对现实的推论。</div><section class="contribute-band">${icon("flask")}<div><h3>做了一个不一样的尝试？</h3><p>分享条件、步骤、结果和疑问，让其他人可以复现。</p></div><a class="button" href="../community/index.html?compose=experiment">分享实践 ${icon("arrow")}</a></section></div>`,
  });
}
