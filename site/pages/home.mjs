import { escapeHtml, shell, badge } from '../components/html.mjs';

export function renderHome({cases, planned, knowledgeById}) {
  const card = (item, published) => {
    const tags = item.knowledge.slice(0,3).map(id => {
      const k = knowledgeById.get(id);
      return k ? `<span>${escapeHtml(k.title)}</span>` : '';
    }).join('');
    return `<a class="problem-card ${published?'':'planned'}" href="${published?`cases/${item.id}/index.html`:'#planned'}">
      <div class="problem-meta"><span>${escapeHtml(item.category)}</span><span>${published?'AGENT LAB':'PLANNED'}</span></div>
      <h3>${escapeHtml(item.title)}</h3><p class="subtitle">${escapeHtml(item.subtitle)}</p><p>${escapeHtml(item.hook)}</p>
      <div class="mini-concepts">${tags}</div><div class="problem-foot"><span>${published?'进入 Executable Case':'待扩展'}</span><b>${published?'→':'·'}</b></div>
    </a>`;
  };

  const body = `
  <section class="hero wrap">
    <div class="hero-copy"><p class="kicker">Interactive knowledge project for agent engineering</p><h1>先遇到问题。<br><em>再让 Agent 在实验里证明方法论。</em></h1><p class="lede">Case、Knowledge、HTML Page、Runtime 都是独立维护对象。每个 Case 都能重放：Run Agent → Observe → Change Harness → Re-run → Verify。</p><div class="hero-actions"><a class="primary" href="explore/index.html">打开知识地图 →</a><a class="secondary" href="cases/tests-green-wrong/index.html">进入 Agent Lab</a></div></div>
    <div class="hero-loop"><div class="loop-node strong"><span>01</span><b>Problem</b><small>真实异常</small></div><i>→</i><div class="loop-node"><span>02</span><b>Agent</b><small>真实轨迹</small></div><i>→</i><div class="loop-node"><span>03</span><b>Evidence</b><small>外部事实</small></div><i>→</i><div class="loop-node"><span>04</span><b>Theory</b><small>解释与边界</small></div><i>→</i><div class="loop-node"><span>05</span><b>Control</b><small>重跑验证</small></div></div>
  </section>
  <section class="manifesto-band"><div class="wrap manifesto-grid"><div><span>CASE</span><b>用例独立扩展</b></div><div><span>KNOWLEDGE</span><b>知识点独立复用</b></div><div><span>PAGE</span><b>统一模板生成</b></div><div><span>RUNTIME</span><b>交互逻辑可插拔</b></div></div></section>
  <section class="wrap section" id="atlas"><div class="section-head"><div><p class="kicker">Case registry</p><h2>Executable Cases</h2></div><p>首页不硬编码内容。它由 <code>content/cases</code> registry 自动生成。</p></div><div class="problem-grid">${cases.map(c => card(c,true)).join('')}${planned.map(c => card(c,false)).join('')}</div></section>
  <section class="wrap section"><div class="section-head compact"><div><p class="kicker">Knowledge registry</p><h2>后台知识不是文章目录，而是可被多个 Case 复用的对象。</h2></div></div><div class="legend-grid">${[...knowledgeById.values()].slice(0,6).map(k=>`<a class="knowledge-mini" href="knowledge/${k.id}/index.html">${badge(k.epistemicType)}<h3>${escapeHtml(k.titleZh)}</h3><p>${escapeHtml(k.summary)}</p></a>`).join('')}</div></section>`;
  return shell({title:'Knowledge Atlas', body, root:'./', active:'problems'});
}
