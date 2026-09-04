import { escapeHtml, shell } from '../components/html.mjs';

function scriptJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function asCaseNode(item, status) {
  return {
    key: `case:${item.id}`,
    kind: 'case',
    id: item.id,
    status,
    category: item.category,
    title: item.title,
    titleEn: item.subtitle,
    summary: item.hook,
    knowledge: item.knowledge || [],
    href: status === 'published' ? `../cases/${item.id}/index.html` : null
  };
}

function asKnowledgeNode(item) {
  return {
    key: `knowledge:${item.id}`,
    kind: 'knowledge',
    id: item.id,
    status: item.status,
    epistemicType: item.epistemicType,
    title: item.titleZh,
    titleEn: item.title,
    summary: item.summary,
    formula: item.formula || null,
    assumptions: item.assumptions,
    doesNotImply: item.doesNotImply,
    engineeringImplications: item.engineeringImplications,
    href: `../knowledge/${item.id}/index.html`
  };
}

export function renderExplore({ cases, planned, knowledge }) {
  const caseNodes = [
    ...cases.map(item => asCaseNode(item, 'published')),
    ...planned.map(item => asCaseNode(item, 'planned'))
  ];
  const knowledgeNodes = knowledge.map(asKnowledgeNode);
  const nodes = [...caseNodes, ...knowledgeNodes];
  const edges = caseNodes.flatMap(item => item.knowledge.map(knowledgeId => ({
    source: item.key,
    target: `knowledge:${knowledgeId}`
  })));
  const types = new Set(knowledge.map(item => item.epistemicType)).size;

  const data = { schemaVersion: 1, nodes, edges };
  const body = `<section class="atlas-explorer" data-atlas-explorer>
    <script type="application/json" data-atlas-data>${scriptJson(data)}</script>
    <header class="explorer-intro wrap">
      <div>
        <p class="kicker">Interactive knowledge map</p>
        <h1>从问题出发，<br><em>沿关系理解知识。</em></h1>
        <p>Case 是入口，Knowledge 是可复用的解释。选择任意节点，查看它连接的问题、假设边界与工程含义。</p>
      </div>
      <div class="explorer-stats" aria-label="Atlas statistics">
        <div><b>${caseNodes.length}</b><span>Cases</span><small>${cases.length} executable · ${planned.length} planned</small></div>
        <div><b>${knowledgeNodes.length}</b><span>Knowledge</span><small>${types} epistemic types</small></div>
        <div><b>${edges.length}</b><span>Relations</span><small>Case → Knowledge</small></div>
      </div>
    </header>

    <div class="explorer-controls-wrap">
      <div class="explorer-controls wrap">
        <label class="explorer-search">
          <span>SEARCH</span>
          <input type="search" data-atlas-search placeholder="搜索问题、知识点或英文名…" autocomplete="off" />
          <kbd>⌘ K</kbd>
        </label>
        <div class="explorer-filters" role="group" aria-label="Filter atlas nodes">
          <button type="button" class="is-active" data-atlas-filter="all" aria-pressed="true">全部 <span>${nodes.length}</span></button>
          <button type="button" data-atlas-filter="case" aria-pressed="false">Cases <span>${caseNodes.length}</span></button>
          <button type="button" data-atlas-filter="knowledge" aria-pressed="false">Knowledge <span>${knowledgeNodes.length}</span></button>
          <button type="button" data-atlas-filter="published" aria-pressed="false">已发布 <span>${knowledgeNodes.length + cases.length}</span></button>
        </div>
        <button type="button" class="explorer-reset" data-atlas-reset>重置视图</button>
      </div>
    </div>

    <div class="explorer-workspace wrap">
      <section class="atlas-map-card" aria-labelledby="atlas-map-title">
        <div class="atlas-map-head">
          <div><small>RELATION MAP</small><h2 id="atlas-map-title">问题与知识的双向索引</h2></div>
          <div class="atlas-legend"><span><i class="case-dot"></i>Case</span><span><i class="knowledge-dot"></i>Knowledge</span><span><i class="planned-dot"></i>Planned</span></div>
        </div>
        <div class="atlas-canvas" data-atlas-canvas>
          <svg viewBox="0 0 1000 760" preserveAspectRatio="none" aria-hidden="true" data-atlas-edges></svg>
          <div class="atlas-node-layer" data-atlas-nodes></div>
          <div class="atlas-empty" data-atlas-empty hidden>没有匹配的节点。试试更短的关键词。</div>
        </div>
        <p class="atlas-map-help">点击节点聚焦一跳关系；再次点击空白处返回全图。键盘可用 Tab 选择节点。</p>
      </section>

      <aside class="atlas-inspector" data-atlas-inspector aria-live="polite">
        <div class="inspector-empty">
          <span>SELECT A NODE</span>
          <h2>选择一个问题或知识点</h2>
          <p>这里会显示定义、适用边界、关联节点，以及可继续打开的完整页面。</p>
          <div class="inspector-prompt"><small>可以从这里开始</small><button type="button" data-atlas-suggest="case:tests-green-wrong">为什么测试全绿，任务仍可能是错的？</button></div>
        </div>
      </aside>
    </div>

    <section class="atlas-list-section wrap" aria-labelledby="atlas-list-title">
      <div class="atlas-list-head"><div><small>FILTERED INDEX</small><h2 id="atlas-list-title">当前视图</h2></div><span data-atlas-result-count>${nodes.length} nodes</span></div>
      <div class="atlas-result-list" data-atlas-list></div>
    </section>
    <noscript><p class="wrap atlas-noscript">关系图需要 JavaScript；你仍可通过导航中的 Knowledge 浏览全部知识对象。</p></noscript>
  </section>
  <script type="module" src="../assets/explorer.js"></script>`;

  return shell({ title: 'Explore — Knowledge Atlas', body, root: '../', active: 'explore' });
}
