const root = document.querySelector('[data-atlas-explorer]');

if (root) {
  const data = JSON.parse(root.querySelector('[data-atlas-data]').textContent);
  const nodeByKey = new Map(data.nodes.map(node => [node.key, node]));
  const neighbors = new Map(data.nodes.map(node => [node.key, new Set()]));
  for (const edge of data.edges) {
    neighbors.get(edge.source)?.add(edge.target);
    neighbors.get(edge.target)?.add(edge.source);
  }

  const ui = {
    search: root.querySelector('[data-atlas-search]'),
    filters: [...root.querySelectorAll('[data-atlas-filter]')],
    reset: root.querySelector('[data-atlas-reset]'),
    canvas: root.querySelector('[data-atlas-canvas]'),
    edgeLayer: root.querySelector('[data-atlas-edges]'),
    nodeLayer: root.querySelector('[data-atlas-nodes]'),
    inspector: root.querySelector('[data-atlas-inspector]'),
    list: root.querySelector('[data-atlas-list]'),
    resultCount: root.querySelector('[data-atlas-result-count]'),
    empty: root.querySelector('[data-atlas-empty]')
  };

  let activeFilter = 'all';
  let selectedKey = null;
  const nodeElements = new Map();
  const edgeElements = [];

  function escapeText(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function humanType(value = '') {
    return String(value).replaceAll('_', ' ');
  }

  function evenlySpaced(count, start = 66, end = 694) {
    if (count <= 1) return [(start + end) / 2];
    return Array.from({ length: count }, (_, index) => start + ((end - start) * index) / (count - 1));
  }

  function orderedKnowledge() {
    const firstReference = new Map();
    let order = 0;
    for (const edge of data.edges) {
      if (!firstReference.has(edge.target)) firstReference.set(edge.target, order++);
    }
    return data.nodes.filter(node => node.kind === 'knowledge').sort((a, b) => {
      return (firstReference.get(a.key) ?? 999) - (firstReference.get(b.key) ?? 999);
    });
  }

  const cases = data.nodes.filter(node => node.kind === 'case');
  const knowledge = orderedKnowledge();
  const caseY = evenlySpaced(cases.length, 78, 682);
  const knowledgeY = evenlySpaced(knowledge.length, 48, 712);
  const positions = new Map([
    ...cases.map((node, index) => [node.key, { x: 190, y: caseY[index] }]),
    ...knowledge.map((node, index) => [node.key, { x: 810, y: knowledgeY[index] }])
  ]);

  function nodeEyebrow(node) {
    if (node.kind === 'knowledge') return humanType(node.epistemicType);
    return node.status === 'published' ? `${node.category} · AGENT LAB` : `${node.category} · PLANNED`;
  }

  function nodeSubline(node) {
    if (node.kind === 'knowledge') return node.titleEn;
    return node.status === 'published' ? '可运行 Case' : '路线图 Case';
  }

  for (const node of data.nodes) {
    const position = positions.get(node.key);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `atlas-node atlas-node-${node.kind}${node.status === 'planned' ? ' is-planned' : ''}`;
    button.dataset.nodeKey = node.key;
    button.style.left = `${position.x / 10}%`;
    button.style.top = `${position.y / 7.6}%`;
    button.setAttribute('aria-label', `${node.kind === 'case' ? 'Case' : 'Knowledge'}: ${node.title}`);
    button.innerHTML = `<small>${escapeText(nodeEyebrow(node))}</small><strong>${escapeText(node.title)}</strong><span>${escapeText(nodeSubline(node))}</span>`;
    button.addEventListener('click', event => {
      event.stopPropagation();
      selectNode(node.key, { updateHash: true });
    });
    ui.nodeLayer.append(button);
    nodeElements.set(node.key, button);
  }

  for (const edge of data.edges) {
    const source = positions.get(edge.source);
    const target = positions.get(edge.target);
    if (!source || !target) continue;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const bend = 205 + Math.abs(source.y - target.y) * 0.08;
    path.setAttribute('d', `M ${source.x} ${source.y} C ${source.x + bend} ${source.y}, ${target.x - bend} ${target.y}, ${target.x} ${target.y}`);
    path.dataset.source = edge.source;
    path.dataset.target = edge.target;
    ui.edgeLayer.append(path);
    edgeElements.push(path);
  }

  function searchText(node) {
    const related = [...(neighbors.get(node.key) || [])].map(key => {
      const item = nodeByKey.get(key);
      return `${item?.title || ''} ${item?.titleEn || ''}`;
    }).join(' ');
    return [node.id, node.title, node.titleEn, node.summary, node.category, node.epistemicType, related].filter(Boolean).join(' ').toLocaleLowerCase();
  }

  function matchesFilter(node) {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'published') return node.status === 'published';
    return node.kind === activeFilter;
  }

  function visibleNodes() {
    const query = ui.search.value.trim().toLocaleLowerCase();
    return data.nodes.filter(node => matchesFilter(node) && (!query || searchText(node).includes(query)));
  }

  function relatedNodes(key) {
    return [...(neighbors.get(key) || [])].map(item => nodeByKey.get(item)).filter(Boolean);
  }

  function renderList(nodes) {
    ui.resultCount.textContent = `${nodes.length} node${nodes.length === 1 ? '' : 's'}`;
    ui.list.innerHTML = nodes.map(node => `<button type="button" class="atlas-result-card${node.key === selectedKey ? ' is-selected' : ''}" data-list-key="${escapeText(node.key)}">
      <span class="result-kind result-kind-${node.kind}">${node.kind === 'case' ? (node.status === 'published' ? 'CASE · LIVE' : 'CASE · PLANNED') : escapeText(humanType(node.epistemicType))}</span>
      <strong>${escapeText(node.title)}</strong>
      <small>${escapeText(node.titleEn)}</small>
      <p>${escapeText(node.summary)}</p>
      <i>${relatedNodes(node.key).length} relation${relatedNodes(node.key).length === 1 ? '' : 's'} →</i>
    </button>`).join('');
  }

  function renderInspector(node) {
    const related = relatedNodes(node.key);
    const relatedMarkup = related.length ? related.map(item => `<button type="button" data-atlas-jump="${escapeText(item.key)}"><small>${item.kind === 'case' ? (item.status === 'published' ? 'LIVE CASE' : 'PLANNED CASE') : 'KNOWLEDGE'}</small>${escapeText(item.title)}</button>`).join('') : '<p class="inspector-no-relations">暂无关联节点</p>';

    if (node.kind === 'knowledge') {
      const assumptions = node.assumptions.map(item => `<li>${escapeText(item)}</li>`).join('');
      const boundaries = node.doesNotImply.map(item => `<li>${escapeText(item)}</li>`).join('');
      const implications = node.engineeringImplications.map(item => `<li>${escapeText(item)}</li>`).join('');
      ui.inspector.innerHTML = `<div class="inspector-content">
        <div class="inspector-top"><span>KNOWLEDGE</span><b>${escapeText(humanType(node.epistemicType))}</b></div>
        <h2>${escapeText(node.title)}</h2><p class="inspector-en">${escapeText(node.titleEn)}</p>
        <p class="inspector-summary">${escapeText(node.summary)}</p>
        ${node.formula ? `<div class="inspector-formula">${escapeText(node.formula)}</div>` : ''}
        <details open><summary>适用假设 <span>${node.assumptions.length}</span></summary><ul>${assumptions}</ul></details>
        <details><summary>不代表什么 <span>${node.doesNotImply.length}</span></summary><ul>${boundaries}</ul></details>
        <details><summary>工程含义 <span>${node.engineeringImplications.length}</span></summary><ul>${implications}</ul></details>
        <section class="inspector-relations"><small>CONNECTED CASES</small><div>${relatedMarkup}</div></section>
        <a class="primary inspector-open" href="${escapeText(node.href)}">打开完整知识对象 →</a>
      </div>`;
      return;
    }

    ui.inspector.innerHTML = `<div class="inspector-content">
      <div class="inspector-top"><span>CASE</span><b class="${node.status === 'planned' ? 'is-planned' : ''}">${node.status === 'published' ? 'EXECUTABLE' : 'PLANNED'}</b></div>
      <h2>${escapeText(node.title)}</h2><p class="inspector-en">${escapeText(node.titleEn)}</p>
      <p class="inspector-summary">${escapeText(node.summary)}</p>
      <section class="inspector-relations"><small>KNOWLEDGE USED BY THIS CASE</small><div>${relatedMarkup}</div></section>
      ${node.href ? `<a class="primary inspector-open" href="${escapeText(node.href)}">进入 Agent Lab →</a>` : '<div class="inspector-state"><b>还在路线图中</b><span>知识关系已经可探索；可执行实验将在 Case 发布后出现。</span></div>'}
    </div>`;
  }

  function updateView() {
    const visible = visibleNodes();
    const visibleKeys = new Set(visible.map(node => node.key));
    if (selectedKey && !visibleKeys.has(selectedKey)) selectedKey = null;
    const focusKeys = selectedKey ? new Set([selectedKey, ...(neighbors.get(selectedKey) || [])]) : null;

    for (const [key, element] of nodeElements) {
      const isVisible = visibleKeys.has(key);
      element.hidden = !isVisible;
      element.classList.toggle('is-selected', key === selectedKey);
      element.classList.toggle('is-muted', Boolean(focusKeys && !focusKeys.has(key)));
    }

    for (const edge of edgeElements) {
      const isVisible = visibleKeys.has(edge.dataset.source) && visibleKeys.has(edge.dataset.target);
      const isActive = selectedKey && (edge.dataset.source === selectedKey || edge.dataset.target === selectedKey);
      edge.hidden = !isVisible;
      edge.classList.toggle('is-active', Boolean(isActive));
      edge.classList.toggle('is-muted', Boolean(selectedKey && !isActive));
    }

    ui.empty.hidden = visible.length > 0;
    renderList(visible);
    if (!selectedKey) renderEmptyInspector();
  }

  function renderEmptyInspector() {
    ui.inspector.innerHTML = `<div class="inspector-empty">
      <span>SELECT A NODE</span>
      <h2>选择一个问题或知识点</h2>
      <p>这里会显示定义、适用边界、关联节点，以及可继续打开的完整页面。</p>
      <div class="inspector-prompt"><small>可以从这里开始</small><button type="button" data-atlas-suggest="case:tests-green-wrong">为什么测试全绿，任务仍可能是错的？</button></div>
    </div>`;
  }

  function setHash(key) {
    const url = new URL(window.location.href);
    url.hash = key ? encodeURIComponent(key) : '';
    history.replaceState(null, '', url);
  }

  function selectNode(key, { updateHash = false } = {}) {
    const node = nodeByKey.get(key);
    if (!node) return;
    selectedKey = key;
    renderInspector(node);
    updateView();
    if (updateHash) setHash(key);
  }

  function resetView() {
    selectedKey = null;
    activeFilter = 'all';
    ui.search.value = '';
    for (const button of ui.filters) {
      const active = button.dataset.atlasFilter === 'all';
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    setHash('');
    updateView();
  }

  ui.search.addEventListener('input', updateView);
  ui.filters.forEach(button => button.addEventListener('click', () => {
    activeFilter = button.dataset.atlasFilter;
    for (const item of ui.filters) {
      const active = item === button;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    }
    updateView();
  }));
  ui.reset.addEventListener('click', resetView);
  ui.canvas.addEventListener('click', event => {
    if (event.target.closest?.('[data-node-key]')) return;
    selectedKey = null;
    setHash('');
    updateView();
  });
  ui.inspector.addEventListener('click', event => {
    const target = event.target.closest('[data-atlas-jump], [data-atlas-suggest]');
    if (!target) return;
    selectNode(target.dataset.atlasJump || target.dataset.atlasSuggest, { updateHash: true });
  });
  ui.list.addEventListener('click', event => {
    const target = event.target.closest('[data-list-key]');
    if (target) selectNode(target.dataset.listKey, { updateHash: true });
  });
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      ui.search.focus();
    }
    if (event.key === 'Escape' && document.activeElement === ui.search) {
      ui.search.value = '';
      ui.search.blur();
      updateView();
    }
  });

  const initialKey = decodeURIComponent(window.location.hash.slice(1));
  if (nodeByKey.has(initialKey)) selectNode(initialKey);
  else updateView();
}
