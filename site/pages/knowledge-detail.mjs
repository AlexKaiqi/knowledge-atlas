import { escapeHtml, shell, badge } from '../components/html.mjs';
function list(items){return `<ul>${items.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>`}
export function renderKnowledgeDetail({knowledge, usedByCases}) {
  const k = knowledge;
  const cases = usedByCases.map(c => c.status === 'published'
    ? `<a href="../../cases/${c.id}/index.html">${escapeHtml(c.title)}</a>`
    : `<span class="planned-ref"><b>PLANNED</b>${escapeHtml(c.title)}</span>`).join('');
  const sources = k.sources.map(source => source.url
    ? `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.label)} ↗</a></li>`
    : `<li>${escapeHtml(source.label)}</li>`).join('');
  const body = `<article class="wrap narrow knowledge-detail"><a class="back" href="../index.html">← Knowledge Registry</a><p class="kicker">Knowledge object / ${escapeHtml(k.id)}</p><div class="knowledge-title">${badge(k.epistemicType)}<h1>${escapeHtml(k.titleZh)}</h1><p>${escapeHtml(k.title)}</p></div><p class="lede">${escapeHtml(k.summary)}</p>${k.formula?`<div class="formula">${escapeHtml(k.formula)}</div>`:''}<section><h2>Statement</h2><p>${escapeHtml(k.statement)}</p></section><section class="knowledge-grid"><div><h3>Assumptions</h3>${list(k.assumptions)}</div><div><h3>Does not imply</h3>${list(k.doesNotImply)}</div></section><section><h2>Engineering implications</h2>${list(k.engineeringImplications)}</section><section><h2>Used by Cases</h2><div class="mini-concepts">${cases || '<span>暂无关联 Case</span>'}</div></section>${k.sources.length?`<section class="knowledge-sources"><h2>Sources</h2><ul>${sources}</ul></section>`:''}</article>`;
  return shell({title:`${k.titleZh} — Knowledge Atlas`,body,root:'../../',active:'knowledge'});
}
