import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import { drag } from 'd3-drag';
import { select } from 'd3-selection';
import { zoom, zoomIdentity } from 'd3-zoom';
import { animate } from 'motion/mini';

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
    world: root.querySelector('[data-atlas-world]'),
    edgeLayer: root.querySelector('[data-atlas-edges]'),
    nodeLayer: root.querySelector('[data-atlas-nodes]'),
    inspector: root.querySelector('[data-atlas-inspector]'),
    resultCount: root.querySelector('[data-atlas-result-count]'),
    empty: root.querySelector('[data-atlas-empty]'),
    mapContext: root.querySelector('[data-atlas-map-context]'),
    zoomIn: root.querySelector('[data-atlas-zoom-in]'),
    zoomOut: root.querySelector('[data-atlas-zoom-out]'),
    fit: root.querySelector('[data-atlas-fit]')
  };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const graphNodes = data.nodes.map((node, index) => ({
    ...node,
    x: 100 + ((index * 89) % 620),
    y: 80 + ((index * 137) % 480)
  }));
  const graphNodeByKey = new Map(graphNodes.map(node => [node.key, node]));
  const nodeElements = new Map();
  const edgeElements = new Map();
  const caseOrder = new Map(data.nodes.filter(node => node.kind === 'case').map((node, index) => [node.key, index]));
  const activeSelection = select(ui.canvas);

  let activeFilter = 'all';
  let selectedKey = null;
  let hoverKey = null;
  let width = 800;
  let height = 620;
  let visibleKeys = new Set(data.nodes.map(node => node.key));
  let currentTransform = zoomIdentity;
  let fitAfterLayout = true;

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

  function relatedNodes(key) {
    return [...(neighbors.get(key) || [])].map(item => nodeByKey.get(item)).filter(Boolean);
  }

  function primaryCaseIndex(node) {
    if (node.kind === 'case') return caseOrder.get(node.key) || 0;
    const indexes = relatedNodes(node.key).map(item => caseOrder.get(item.key)).filter(Number.isFinite);
    return indexes.length ? Math.min(...indexes) : 0;
  }

  function targetY(node) {
    const caseCount = Math.max(2, caseOrder.size);
    const inset = Math.min(92, height * 0.16);
    return inset + (primaryCaseIndex(node) / (caseCount - 1)) * (height - inset * 2);
  }

  function nodeLabel(node, index) {
    const number = String(index + 1).padStart(2, '0');
    if (node.kind === 'case') {
      const status = node.status === 'published' ? 'LIVE EXPERIMENT' : 'PLANNED CASE';
      return `<span class="atlas-node-index">C.${number}</span><span class="atlas-node-copy"><small>${escapeText(node.category)} · ${status}</small><strong>${escapeText(node.title)}</strong></span>`;
    }
    return `<span class="atlas-node-mark" aria-hidden="true"></span><span class="atlas-node-copy"><small>K.${number} · ${escapeText(humanType(node.epistemicType))}</small><strong>${escapeText(node.title)}</strong><span>${escapeText(node.titleEn)}</span></span>`;
  }

  for (const [index, node] of data.nodes.entries()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `atlas-node atlas-node-${node.kind}${node.status === 'planned' ? ' is-planned' : ''}`;
    button.dataset.nodeKey = node.key;
    button.setAttribute('aria-label', `${node.kind === 'case' ? '问题' : '知识'}：${node.title}`);
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = `<span class="atlas-node-inner">${nodeLabel(node, index)}</span>`;
    button.addEventListener('click', event => {
      event.stopPropagation();
      selectNode(node.key, { updateHash: true });
    });
    button.addEventListener('mouseenter', () => {
      hoverKey = node.key;
      updateEmphasis();
    });
    button.addEventListener('mouseleave', () => {
      hoverKey = null;
      updateEmphasis();
    });
    ui.nodeLayer.append(button);
    nodeElements.set(node.key, button);
  }

  for (const edge of data.edges) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const key = `${edge.source}|${edge.target}`;
    path.dataset.source = edge.source;
    path.dataset.target = edge.target;
    path.dataset.edgeKey = key;
    ui.edgeLayer.append(path);
    edgeElements.set(key, path);
  }

  function renderTick() {
    for (const node of graphNodes) {
      const element = nodeElements.get(node.key);
      if (!element || element.hidden) continue;
      const radius = node.kind === 'case' ? 76 : 54;
      node.x = Math.max(radius, Math.min(width - radius, node.x || width / 2));
      node.y = Math.max(44, Math.min(height - 44, node.y || height / 2));
      element.style.left = `${node.x}px`;
      element.style.top = `${node.y}px`;
    }

    for (const [key, path] of edgeElements) {
      if (path.hidden) continue;
      const [sourceKey, targetKey] = key.split('|');
      const source = graphNodeByKey.get(sourceKey);
      const target = graphNodeByKey.get(targetKey);
      if (!source || !target) continue;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const curve = Math.min(42, 14 + Math.abs(dy) * 0.08);
      const midX = (source.x + target.x) / 2 - (dy / distance) * curve;
      const midY = (source.y + target.y) / 2 + (dx / distance) * curve;
      path.setAttribute('d', `M ${source.x} ${source.y} Q ${midX} ${midY} ${target.x} ${target.y}`);
    }
  }

  const simulation = forceSimulation(graphNodes)
    .alphaDecay(0.055)
    .velocityDecay(0.35)
    .on('tick', renderTick)
    .on('end', () => {
      if (!fitAfterLayout) return;
      fitAfterLayout = false;
      fitView();
    });

  function restartSimulation({ fit = false } = {}) {
    const activeNodes = graphNodes.filter(node => visibleKeys.has(node.key));
    const activeLinks = data.edges
      .filter(edge => visibleKeys.has(edge.source) && visibleKeys.has(edge.target))
      .map(edge => ({ ...edge }));
    fitAfterLayout = fit;
    simulation
      .nodes(activeNodes)
      .force('link', forceLink(activeLinks).id(node => node.key).distance(150).strength(0.55))
      .force('charge', forceManyBody().strength(node => node.kind === 'case' ? -900 : -560))
      .force('collide', forceCollide(node => node.kind === 'case' ? 94 : 68).strength(0.9).iterations(2))
      .force('x', forceX(node => node.kind === 'case' ? width * 0.28 : width * 0.67).strength(node => node.kind === 'case' ? 0.16 : 0.1))
      .force('y', forceY(targetY).strength(0.09))
      .alpha(0.9)
      .restart();
  }

  const dragBehavior = drag()
    .container(() => ui.canvas)
    .subject((event, node) => node)
    .on('start', (event, node) => {
      if (!event.active) simulation.alphaTarget(0.22).restart();
      const [x, y] = currentTransform.invert([event.x, event.y]);
      node.fx = x;
      node.fy = y;
    })
    .on('drag', (event, node) => {
      const [x, y] = currentTransform.invert([event.x, event.y]);
      node.fx = x;
      node.fy = y;
    })
    .on('end', (event, node) => {
      if (!event.active) simulation.alphaTarget(0);
      node.fx = null;
      node.fy = null;
    });

  for (const node of graphNodes) select(nodeElements.get(node.key)).datum(node).call(dragBehavior);

  const zoomBehavior = zoom()
    .scaleExtent([0.65, 2.4])
    .filter(event => {
      if (event.type === 'wheel') return event.ctrlKey || event.metaKey;
      return !event.target.closest?.('button, input, a, summary');
    })
    .on('zoom', event => {
      currentTransform = event.transform;
      ui.world.style.transform = `translate(${currentTransform.x}px, ${currentTransform.y}px) scale(${currentTransform.k})`;
    });

  activeSelection.call(zoomBehavior).on('dblclick.zoom', null);

  function fitView() {
    const nodes = graphNodes.filter(node => visibleKeys.has(node.key));
    if (!nodes.length) return;
    const minX = Math.min(...nodes.map(node => node.x)) - 105;
    const maxX = Math.max(...nodes.map(node => node.x)) + 105;
    const minY = Math.min(...nodes.map(node => node.y)) - 72;
    const maxY = Math.max(...nodes.map(node => node.y)) + 72;
    const graphWidth = Math.max(1, maxX - minX);
    const graphHeight = Math.max(1, maxY - minY);
    const scale = Math.max(0.65, Math.min(1.15, 0.9 * Math.min(width / graphWidth, height / graphHeight)));
    const x = width / 2 - scale * (minX + maxX) / 2;
    const y = height / 2 - scale * (minY + maxY) / 2;
    activeSelection.call(zoomBehavior.transform, zoomIdentity.translate(x, y).scale(scale));
  }

  function searchText(node) {
    const related = relatedNodes(node.key).map(item => `${item.title} ${item.titleEn || ''}`).join(' ');
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

  function updateEmphasis() {
    const focusKey = selectedKey || hoverKey;
    const focusKeys = focusKey ? new Set([focusKey, ...(neighbors.get(focusKey) || [])]) : null;

    for (const [key, element] of nodeElements) {
      element.classList.toggle('is-selected', key === selectedKey);
      element.classList.toggle('is-related', Boolean(focusKeys && focusKeys.has(key) && key !== focusKey));
      element.classList.toggle('is-muted', Boolean(focusKeys && !focusKeys.has(key)));
      element.setAttribute('aria-pressed', String(key === selectedKey));
    }

    for (const path of edgeElements.values()) {
      const active = focusKey && (path.dataset.source === focusKey || path.dataset.target === focusKey);
      path.classList.toggle('is-active', Boolean(active));
      path.classList.toggle('is-muted', Boolean(focusKey && !active));
    }
  }

  function renderEmptyInspector() {
    ui.inspector.innerHTML = `<div class="inspector-empty">
      <span>FIELD NOTE · —</span>
      <h2>选择地图上的一个节点</h2>
      <p>右侧将成为它的研究批注：定义、边界、工程含义，以及沿关系继续探索的路径。</p>
      <div class="inspector-coordinate"><small>ATLAS COORDINATE</small><b>CASE ↔ KNOWLEDGE</b><span>${data.nodes.filter(node => node.kind === 'case').length} problems · ${data.nodes.filter(node => node.kind === 'knowledge').length} concepts · ${data.edges.length} links</span></div>
    </div>`;
  }

  function relationMarkup(node) {
    const related = relatedNodes(node.key);
    if (!related.length) return '<p class="inspector-no-relations">暂无关联节点</p>';
    return related.map((item, index) => `<button type="button" data-atlas-jump="${escapeText(item.key)}"><i>${String(index + 1).padStart(2, '0')}</i><span><small>${item.kind === 'case' ? (item.status === 'published' ? 'LIVE CASE' : 'PLANNED CASE') : 'KNOWLEDGE'}</small>${escapeText(item.title)}</span></button>`).join('');
  }

  function renderInspector(node) {
    const relations = relationMarkup(node);
    if (node.kind === 'knowledge') {
      const assumptions = node.assumptions.map(item => `<li>${escapeText(item)}</li>`).join('');
      const boundaries = node.doesNotImply.map(item => `<li>${escapeText(item)}</li>`).join('');
      const implications = node.engineeringImplications.map(item => `<li>${escapeText(item)}</li>`).join('');
      ui.inspector.innerHTML = `<article class="inspector-content">
        <div class="inspector-top"><span>KNOWLEDGE SPECIMEN</span><b>${escapeText(humanType(node.epistemicType))}</b></div>
        <h2>${escapeText(node.title)}</h2><p class="inspector-en">${escapeText(node.titleEn)}</p>
        <blockquote>${escapeText(node.summary)}</blockquote>
        ${node.formula ? `<div class="inspector-formula"><small>FORMULA</small>${escapeText(node.formula)}</div>` : ''}
        <details open><summary>适用假设 <span>${node.assumptions.length}</span></summary><ul>${assumptions}</ul></details>
        <details><summary>它不代表什么 <span>${node.doesNotImply.length}</span></summary><ul>${boundaries}</ul></details>
        <details><summary>工程动作 <span>${node.engineeringImplications.length}</span></summary><ul>${implications}</ul></details>
        <section class="inspector-relations"><small>FOLLOW THE PATH</small><div>${relations}</div></section>
        <a class="inspector-open" href="${escapeText(node.href)}">阅读完整词条 <span>↗</span></a>
      </article>`;
    } else {
      ui.inspector.innerHTML = `<article class="inspector-content">
        <div class="inspector-top"><span>PROBLEM FIELD</span><b class="${node.status === 'planned' ? 'is-planned' : ''}">${node.status === 'published' ? 'GUIDED' : 'PLANNED'}</b></div>
        <h2>${escapeText(node.title)}</h2><p class="inspector-en">${escapeText(node.titleEn)}</p>
        <blockquote>${escapeText(node.summary)}</blockquote>
        <section class="inspector-relations"><small>KNOWLEDGE IN THIS CASE</small><div>${relations}</div></section>
        ${node.href ? `<a class="inspector-open" href="${escapeText(node.href)}">进入问题导学 <span>↗</span></a>` : '<div class="inspector-state"><b>路线图中的实验</b><span>关系已经可探索；完整 Agent Lab 会在 Case 发布后出现。</span></div>'}
      </article>`;
    }

    if (!reducedMotion) animate(ui.inspector.firstElementChild, { opacity: [0.35, 1], transform: ['translateX(12px)', 'translateX(0px)'] }, { duration: 0.22, ease: 'ease-out' });
  }

  function filterLabel(count) {
    const labels = { all: '全部问题与知识', case: '问题场', knowledge: '知识标本', published: '已发布对象' };
    const query = ui.search.value.trim();
    return query ? `“${query}” · ${count} 个结果` : labels[activeFilter];
  }

  function updateView({ fit = true } = {}) {
    const visible = visibleNodes();
    visibleKeys = new Set(visible.map(node => node.key));
    if (selectedKey && !visibleKeys.has(selectedKey)) {
      selectedKey = null;
      setHash('');
    }

    for (const [key, element] of nodeElements) element.hidden = !visibleKeys.has(key);
    for (const path of edgeElements.values()) path.hidden = !(visibleKeys.has(path.dataset.source) && visibleKeys.has(path.dataset.target));
    ui.empty.hidden = visible.length > 0;
    ui.resultCount.textContent = `${visible.length} NODES`;
    ui.mapContext.textContent = filterLabel(visible.length);
    if (!selectedKey) renderEmptyInspector();
    updateEmphasis();
    restartSimulation({ fit });

    if (!reducedMotion) {
      visible.slice(0, 12).forEach((node, index) => {
        const inner = nodeElements.get(node.key)?.querySelector('.atlas-node-inner');
        if (inner) animate(inner, { opacity: [0, 1], transform: ['scale(.94)', 'scale(1)'] }, { duration: 0.18, delay: index * 0.012, ease: 'ease-out' });
      });
    }
  }

  function setHash(key) {
    const url = new URL(window.location.href);
    url.hash = key ? encodeURIComponent(key) : '';
    history.replaceState(null, '', url);
  }

  function selectNode(key, { updateHash = false } = {}) {
    const node = nodeByKey.get(key);
    if (!node) return;
    if (!visibleKeys.has(key)) {
      activeFilter = 'all';
      for (const button of ui.filters) {
        const active = button.dataset.atlasFilter === 'all';
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      }
      ui.search.value = '';
      updateView({ fit: false });
    }
    selectedKey = key;
    renderInspector(node);
    ui.mapContext.textContent = `${node.kind === 'case' ? '问题' : '知识'} · ${node.title}`;
    updateEmphasis();
    if (updateHash) setHash(key);
  }

  function resetView() {
    selectedKey = null;
    activeFilter = 'all';
    ui.search.value = '';
    for (const node of graphNodes) {
      node.fx = null;
      node.fy = null;
    }
    for (const button of ui.filters) {
      const active = button.dataset.atlasFilter === 'all';
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    setHash('');
    activeSelection.call(zoomBehavior.transform, zoomIdentity);
    updateView({ fit: true });
  }

  ui.search.addEventListener('input', () => updateView({ fit: true }));
  ui.filters.forEach(button => button.addEventListener('click', () => {
    activeFilter = button.dataset.atlasFilter;
    for (const item of ui.filters) {
      const active = item === button;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    }
    updateView({ fit: true });
  }));
  ui.reset.addEventListener('click', resetView);
  ui.zoomIn.addEventListener('click', () => activeSelection.call(zoomBehavior.scaleBy, 1.22));
  ui.zoomOut.addEventListener('click', () => activeSelection.call(zoomBehavior.scaleBy, 0.82));
  ui.fit.addEventListener('click', fitView);
  ui.canvas.addEventListener('click', event => {
    if (event.target.closest?.('[data-node-key]')) return;
    selectedKey = null;
    setHash('');
    ui.mapContext.textContent = filterLabel(visibleKeys.size);
    renderEmptyInspector();
    updateEmphasis();
  });
  root.addEventListener('click', event => {
    const target = event.target.closest('[data-atlas-jump], [data-atlas-suggest]');
    if (!target) return;
    selectNode(target.dataset.atlasJump || target.dataset.atlasSuggest, { updateHash: true });
  });
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      ui.search.focus();
    }
    if (event.key === 'Escape') {
      if (document.activeElement === ui.search && ui.search.value) {
        ui.search.value = '';
        updateView({ fit: true });
      } else {
        selectedKey = null;
        setHash('');
        renderEmptyInspector();
        updateEmphasis();
      }
    }
  });

  const resize = () => {
    width = Math.max(320, ui.canvas.clientWidth);
    height = Math.max(520, ui.canvas.clientHeight);
    ui.world.style.width = `${width}px`;
    ui.world.style.height = `${height}px`;
    ui.edgeLayer.setAttribute('width', width);
    ui.edgeLayer.setAttribute('height', height);
    ui.edgeLayer.setAttribute('viewBox', `0 0 ${width} ${height}`);
    simulation.force('x')?.x(node => node.kind === 'case' ? width * 0.28 : width * 0.67);
    simulation.force('y')?.y(targetY);
    simulation.alpha(0.35).restart();
    renderTick();
  };
  new ResizeObserver(resize).observe(ui.canvas);
  resize();

  const initialKey = decodeURIComponent(window.location.hash.slice(1));
  updateView({ fit: true });
  if (nodeByKey.has(initialKey)) selectNode(initialKey);
}
