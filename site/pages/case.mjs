import { escapeHtml, shell, badge } from "../components/html.mjs";

function scriptJson(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function renderKnowledgeCards(knowledge) {
  return knowledge
    .map(
      (k) =>
        `<div class="theory-card"><div>${badge(k.epistemicType)}<h3>${escapeHtml(k.titleZh)}</h3></div>${k.formula ? `<div class="formula">${escapeHtml(k.formula)}</div>` : ""}<p>${escapeHtml(k.summary)}</p><small>DOES NOT IMPLY：${escapeHtml(k.doesNotImply[0] || "—")}</small><a href="../../knowledge/${k.id}/index.html">查阅原理与边界 →</a></div>`,
    )
    .join("");
}

function renderCell(c, cell, knowledgeCards) {
  const title = escapeHtml(cell.title || "");
  const baseHead = (kind, tag = "") =>
    `<div class="cell-head"><div><small>${kind}</small><h3>${title}</h3></div>${tag ? `<span class="cell-tag">${tag}</span>` : ""}</div>`;

  if (cell.type === "case") {
    const artifacts = c.artifacts
      .map(
        (item) =>
          `<div><small>${escapeHtml(item.label)}</small><code>${escapeHtml(item.code)}</code><b data-case-field="${escapeHtml(item.id)}">${escapeHtml(item.initial)}</b></div>`,
      )
      .join("");
    return `${baseHead("CASE", "GROUND TRUTH != METRIC")}<p>${escapeHtml(c.problem.initialState)}</p><div class="case-grid">${artifacts}</div>`;
  }

  if (cell.type === "harness") {
    const controls = c.harnessControls
      .map(
        (item) =>
          `<label class="switch-row"><span><b>${escapeHtml(item.label)}</b><small>${escapeHtml(item.description)}</small></span><input type="checkbox" data-harness-id="${escapeHtml(item.id)}" ${item.default ? "checked" : ""}/></label>`,
      )
      .join("");
    return `${baseHead("HARNESS", "EDITABLE")}<div class="harness-controls">${controls}</div><div class="predicted-strategy"><small>AGENT'S CURRENT LOWEST-COST STRATEGY</small><b data-lab-strategy>—</b><span data-lab-strategy-kind></span></div>`;
  }

  if (cell.type === "execution") {
    return `${baseHead("EXECUTION", "TOOL TRACE")}<div class="lab-terminal" data-lab-terminal><div class="terminal-placeholder">等待 Agent 执行。这里记录工具调用与 observer 输出，而不是完成态自然语言。</div></div>`;
  }

  if (cell.type === "verification") {
    const proofs = c.evidence
      .map(
        (item, index) =>
          `<div data-proof-id="${escapeHtml(item.id)}" data-status="idle"><span>${String(index + 1).padStart(2, "0")}</span><div><h4>${escapeHtml(item.label)}</h4><small>${escapeHtml(item.description)}</small></div><b>—</b></div>`,
      )
      .join("");
    return `${baseHead("VERIFY", "EVIDENCE")}<div class="verdict-strip"><div><small>HARNESS VERDICT</small><b data-harness-verdict data-ok="idle">NOT RUN</b></div><div><small>SEMANTIC REALITY</small><b data-reality-verdict data-ok="idle">UNKNOWN</b></div><div><small>TEACHING POSTERIOR</small><b data-confidence>10%</b><div class="confidence-track"><i data-confidence-bar></i></div></div></div><div class="proof-grid">${proofs}</div><p class="epistemic-note"><b>注意：</b>posterior 是教学计算；共享 failure mechanism 的证据不能机械当成独立 LR 连乘。</p>`;
  }

  if (cell.type === "history") {
    return `${baseHead("REPLAY", "EXPERIMENT HISTORY")}<p>每次运行都冻结当时的 Harness。改变控制条件后重新运行，才能把“干预”与“轨迹变化”对应起来。</p><div class="run-history" data-run-history></div>`;
  }

  if (cell.type === "knowledge") {
    return `${baseHead("KNOWLEDGE LINKS")}<div class="theory-stack">${knowledgeCards}</div>`;
  }

  return `${baseHead("UNKNOWN")}<p>Unsupported notebook cell type: <code>${escapeHtml(cell.type)}</code></p>`;
}

export function renderCase({ caseData, knowledge }) {
  const c = caseData;
  const knowledgeCards = renderKnowledgeCards(knowledge);
  const notebookCells = c.notebook
    .map(
      (cell, index) =>
        `<section class="nb-cell ${cell.type === "knowledge" ? "markdown-cell" : ""}"><div class="cell-gutter"><span>[${index + 1}]</span></div><div class="cell-body">${renderCell(c, cell, knowledgeCards)}</div></section>`,
    )
    .join("");
  const quickPrompts = (c.quickPrompts || [])
    .map(
      (prompt, index) =>
        `<button type="button" data-agent-quick="${escapeHtml(prompt)}">${escapeHtml(["自己解决", "要求自证", "反驳证据", "下一条约束", "比较运行"][index] || prompt)}</button>`,
    )
    .join("");
  const runtimeModule = c.runtime.module;

  const body = `<article><section class="lesson-hero wrap narrow"><a class="back" href="../../practice/index.html">← 实践实验</a><p class="kicker">${escapeHtml(c.category)} / 证据实验</p><h1>${escapeHtml(c.title)}</h1><p class="lesson-subtitle">${escapeHtml(c.subtitle)}</p><div class="question-box"><span>你要验证的目标</span><b>${escapeHtml(c.problem.semanticGoal)}</b></div><div class="concept-row">${knowledge.map((k) => `<a href="../../knowledge/${k.id}/index.html" class="concept-chip"><b>${escapeHtml(k.title)}</b>${badge(k.epistemicType)}</a>`).join("")}</div></section>
<section class="wrap narrow notebook-intro"><div><p class="step-label">先观察，再改变条件</p><h2>同一个任务，换一种验收方式。</h2></div><p>${escapeHtml(c.hook)}</p></section>
<section class="lab-wrap agent-notebook" data-agent-notebook data-case-id="${escapeHtml(c.id)}">
<script type="application/json" data-case-manifest>${scriptJson(c)}</script>
<div class="notebook-main"><div class="notebook-toolbar"><div><span class="notebook-dot"></span><b>${escapeHtml(c.id)} / v${c.version}</b><small>规则驱动的教学模拟</small></div><div class="notebook-actions"><button type="button" class="tiny-button" data-save-agent>保存观察</button><span class="run-freshness" data-run-freshness data-state="idle">NOT RUN</span><button type="button" class="tiny-button" data-lab-reset>重置本次</button><button type="button" class="primary compact" data-lab-run>运行实验 ▶</button></div></div>${notebookCells}</div>
<aside class="agent-sidecar"><div class="agent-sidecar-head"><div><small data-agent-mode>${escapeHtml(c.runtime.provider)}</small><h3>Agent</h3></div><span class="agent-status"><i></i> sandbox</span></div><div class="agent-context"><small>VISIBLE CONTEXT</small><p>Task + Harness + execution outputs. 真实语义只能通过允许的 observer 被看见。</p></div><div class="agent-log" data-agent-log aria-live="polite"></div><div class="quick-prompts">${quickPrompts}</div><form class="agent-form" data-agent-form><label for="agent-input">向教学 Agent 追问</label><textarea id="agent-input" data-agent-input rows="3" placeholder="例如：为什么你选择改测试？"></textarea><button class="primary compact" type="submit">提问 ↗</button></form><div class="agent-disclaimer"><b>${escapeHtml(c.runtime.provider.toUpperCase())} provider</b><span>这是规则驱动的教学 Agent。此处按预设规则回应，没有连接在线语言模型。</span></div></aside></section><section class="page"><div class="callout">实验中的策略来自明确的规则，不代表所有 AI 都会如此选择。改变条件后，先前结果不再验证当前条件；请重新运行并比较。</div><div class="actions"><a class="button primary" href="../../questions/tests-green-wrong/index.html#transfer">回到导学，换个情境检验 →</a><a class="button" href="../../community/index.html?target=practice:agent">讨论这次实验</a></div></section></article>
<script type="module" src="../../runtime/${escapeHtml(runtimeModule)}.js"></script>`;
  return shell({
    title: `${c.title} — Knowledge Atlas`,
    body,
    root: "../../",
    active: "problems",
  });
}
