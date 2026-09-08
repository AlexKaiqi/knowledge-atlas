import { escapeHtml, shell } from "../components/html.mjs";

function scriptJson(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function asCaseNode(item, status) {
  return {
    key: `case:${item.id}`,
    kind: "case",
    id: item.id,
    status,
    category: item.category,
    title: item.title,
    titleEn: item.subtitle,
    summary: item.hook,
    knowledge: item.knowledge || [],
    href: status === "published" ? `../cases/${item.id}/index.html` : null,
  };
}

function asKnowledgeNode(item) {
  return {
    key: `knowledge:${item.id}`,
    kind: "knowledge",
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
    href: `../knowledge/${item.id}/index.html`,
  };
}

export function renderExplore({ cases, planned, knowledge, questions }) {
  const caseNodes = questions.map((q) => ({
    ...asCaseNode({ ...q, subtitle: q.category, hook: q.summary }, "published"),
    href: `../questions/${q.id}/index.html`,
  }));
  const knowledgeNodes = knowledge.map(asKnowledgeNode);
  const nodes = [...caseNodes, ...knowledgeNodes];
  const edges = caseNodes.flatMap((item) =>
    item.knowledge.map((knowledgeId) => ({
      source: item.key,
      target: `knowledge:${knowledgeId}`,
    })),
  );
  const data = { schemaVersion: 1, nodes, edges };
  const body = `<section class="atlas-explorer" data-atlas-explorer>
    <script type="application/json" data-atlas-data>${scriptJson(data)}</script>
    <header class="explorer-intro wrap">
      <div>
        <p class="kicker">FOLLOW THE CONNECTIONS</p>
        <h1>知识之间，也有路。</h1>
      </div>
      <p>从一个真实问题开始。拖动地图、沿连线跳转，观察不同知识如何共同解释同一类系统行为。</p>
    </header>

    <div class="explorer-controls-wrap">
      <div class="explorer-controls wrap">
        <label class="explorer-search">
          <span>⌕</span>
          <input type="search" data-atlas-search placeholder="搜索一个问题或概念" autocomplete="off" />
          <kbd>⌘ K</kbd>
        </label>
        <div class="explorer-filters" role="group" aria-label="Filter atlas nodes">
          <button type="button" class="is-active" data-atlas-filter="all" aria-pressed="true">全图 <span>${nodes.length}</span></button>
          <button type="button" data-atlas-filter="case" aria-pressed="false">问题 <span>${caseNodes.length}</span></button>
          <button type="button" data-atlas-filter="knowledge" aria-pressed="false">知识 <span>${knowledgeNodes.length}</span></button>
          <button type="button" data-atlas-filter="published" aria-pressed="false">已发布 <span>${knowledgeNodes.length + cases.length}</span></button>
        </div>
        <span class="explorer-result-count" data-atlas-result-count>${nodes.length} NODES</span>
        <button type="button" class="explorer-reset" data-atlas-reset>RESET</button>
      </div>
    </div>

    <div class="explorer-workspace wrap">
      <aside class="atlas-rail" aria-label="Suggested starting points">
        <div class="atlas-rail-head"><small>起点索引</small><span>01—04</span></div>
        <button type="button" data-atlas-suggest="case:tests-green-wrong"><i>01</i><span><small>VERIFY</small>测试全绿，为什么仍可能是错的？</span></button>
        <button type="button" data-atlas-suggest="knowledge:pearl-causal-hierarchy"><i>02</i><span><small>DEBUG</small>“改完变好”能证明因果吗？</span></button>
        <button type="button" data-atlas-suggest="knowledge:littles-law"><i>03</i><span><small>CONTROL</small>更多并发为何不一定更快？</span></button>
        <button type="button" data-atlas-suggest="knowledge:simon-stable-intermediates"><i>04</i><span><small>BUILD</small>复杂系统如何逐步长出来？</span></button>
        <p><b>图例</b><span><i class="case-dot"></i>问题 / Question</span><span><i class="knowledge-dot"></i>知识 / Knowledge</span><span><i class="planned-dot"></i>延伸线索</span></p>
      </aside>

      <section class="atlas-map-card" aria-labelledby="atlas-map-title">
        <div class="atlas-map-head">
          <div><small>RELATION FIELD</small><h2 id="atlas-map-title" data-atlas-map-context>全部问题与知识</h2></div>
          <div class="atlas-map-tools" aria-label="Map controls">
            <button type="button" data-atlas-zoom-out aria-label="Zoom out">−</button>
            <button type="button" data-atlas-fit>适应</button>
            <button type="button" data-atlas-zoom-in aria-label="Zoom in">＋</button>
          </div>
        </div>
        <div class="atlas-canvas" data-atlas-canvas role="region" aria-label="可拖动和缩放的知识关系图">
          <div class="atlas-world" data-atlas-world>
            <svg aria-hidden="true" data-atlas-edges></svg>
            <div class="atlas-node-layer" data-atlas-nodes></div>
          </div>
          <div class="atlas-empty" data-atlas-empty hidden>没有匹配的节点。试试更短的关键词。</div>
        </div>
        <p class="atlas-map-help"><span>拖动空白处平移 · Ctrl / ⌘ + 滚轮缩放 · 拖动节点重新排布</span><b>选择节点查看一跳关系</b></p>
      </section>

      <aside class="atlas-inspector" data-atlas-inspector aria-live="polite">
        <div class="inspector-empty">
          <span>FIELD NOTE · —</span>
          <h2>选择地图上的一个节点</h2>
          <p>右侧将成为它的理解线索：定义、边界、工程含义，以及沿关系继续探索的路径。</p>
          <div class="inspector-coordinate"><small>ATLAS COORDINATE</small><b>CASE ↔ KNOWLEDGE</b><span>${caseNodes.length} problems · ${knowledgeNodes.length} concepts · ${edges.length} links</span></div>
        </div>
      </aside>
    </div>
    <noscript><p class="wrap atlas-noscript">关系图需要 JavaScript；你仍可通过导航中的 知识百科浏览全部条目。</p></noscript>
  </section>
  <script type="module" src="../assets/explorer.js"></script>`;

  return shell({
    title: "Explore — Knowledge Atlas",
    body,
    root: "../",
    active: "explore",
  });
}
