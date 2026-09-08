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
export function renderExperiment({ kind }) {
  const parallel = kind === "parallel";
  return shell({
    title: `${parallel ? "并行与瓶颈" : "相关与因果"}实验 · 知图`,
    root: "../../",
    active: "practice",
    body: `<div class="page" data-experiment="${kind}"><a class="back-link" href="../index.html">← 实践实验</a>${head("AN EXPLORABLE MODEL", parallel ? "局部变快，整体会快多少？" : "带伞的人，为什么更容易被淋湿？", parallel ? "拖动参数，观察仍未被加速的部分。这个理想模型把协调开销暂时放在一边。" : "同一个世界，只改变比较方法，结论可能完全不同。先看观察数据，再固定天气结构进行干预比较。")}<label class="field"><span>操作前，你预测会发生什么？</span><input data-experiment-prediction class="text-input" maxlength="1000" placeholder="先写一句预测，之后可以比较自己的想法"></label><div class="experiment-grid"><section class="controls-panel"><h3>改变条件</h3>${parallel ? `<label class="control-label" for="parallel-p">可加速工作占比 <output data-p-output>80%</output></label><input id="parallel-p" type="range" min="0" max="100" value="80" data-parallel-p><label class="control-label" for="parallel-s">局部加速倍数 <output data-s-output>4 倍</output></label><input id="parallel-s" type="range" min="1" max="32" value="4" data-parallel-s><div class="callout">固定工作量<br>无额外协调开销<br>时间可连续划分</div>` : `<label class="control-label" for="causal-rain">暴雨天气占比 <output data-rain-output>50%</output></label><input id="causal-rain" type="range" min="5" max="95" value="50" data-causal-rain><label class="field"><span>比较方法</span><select data-causal-mode><option value="observe">观察：比较原本带伞和不带伞的人</option><option value="intervene">干预：两组使用同一天气结构</option></select></label><div class="callout">天气 → 带伞<br>天气 → 淋湿<br>带伞 → 淋湿</div>`}<button class="button small" data-experiment-reset>恢复初始条件</button></section><section class="chart-panel" aria-live="polite"><h3>${parallel ? "相同工作量下的耗时" : "给定模型下的预期淋湿比例"}</h3>${parallel ? `<div class="chart-label"><span>原始耗时</span><span>100%</span></div><div class="bar-track"><div class="bar-serial" data-original-serial></div><div class="bar-parallel" data-original-parallel></div></div><div class="chart-label"><span>优化后</span><span data-time-label></span></div><div class="bar-track"><div class="bar-serial" data-new-serial></div><div class="bar-parallel" data-new-parallel></div></div><div class="chart-legend"><span>未加速部分</span><span>可加速部分</span></div><div class="result-number"><span data-speedup></span><small>倍理想加速</small></div><p class="meta" data-limit></p>` : `<div class="chart-label"><span>带伞</span><span data-wet-umbrella></span></div><div class="bar-track"><div class="bar-parallel" data-umbrella-bar></div></div><div class="chart-label"><span>不带伞</span><span data-wet-without></span></div><div class="bar-track"><div class="bar-serial" data-without-bar></div></div><div class="result-number" style="font:600 23px/1.8 'Noto Sans SC',sans-serif" data-causal-result></div><p class="meta" data-causal-explanation></p>`}</section></div><div class="two-columns section"><section class="panel reading"><h2>模型是怎样算的</h2>${parallel ? `<div class="formula">S = 1 / ((1 − p) + p / s)</div><p>把原时间归一为 1。p 是可加速部分的占比，s 是该部分的加速倍数；新时间等于未加速部分与加速后部分之和。</p><p>当 p &lt; 1，即使局部无限快，整体加速也不会超过 1/(1−p)。人数、计算资源和局部加速倍数不是同一个量。</p><a href="../../knowledge/amdahls-law/index.html">查阅阿姆达尔定律与来源 →</a>` : `<p>设定：暴雨时 90% 的人带伞，普通天气时 10% 带伞。暴雨中带伞/不带伞的淋湿概率分别是 40%/80%；普通天气中分别是 1%/5%。这些数字是教学假设。</p><p>观察模式先用贝叶斯公式算出两组各自的天气构成，再加权淋湿概率；干预模式给两组相同的天气占比，再分别加权。因此，伞在两种天气下都有保护作用，但观察结果仍可能反向。</p><a href="../../knowledge/pearl-causal-hierarchy/index.html">查阅因果阶梯与来源 →</a>`}<p class="callout">模型显示的是给定假设下的结果，不是现实测量。可以质疑假设，并带着新的条件继续探讨。</p></section><section class="panel"><h3>保存一次观察</h3><label class="field"><span>结果支持了什么？又不能说明什么？</span><textarea rows="5" data-experiment-note placeholder="比较预测与结果，记下还没想明白的地方"></textarea></label><div class="actions"><button class="button primary" data-save-experiment>保存实验记录</button><button class="button" data-share-experiment>分享实践</button></div><div data-experiment-status class="status-line" role="status"></div><p class="meta">保存会记录当时的参数和结果；调整参数后请重新保存。</p></section></div></div>`,
  });
}
