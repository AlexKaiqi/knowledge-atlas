import { escapeHtml, shell, badge } from '../components/html.mjs';
export function renderKnowledgeIndex({knowledge}) {
  const body = `<section class="wrap section"><div class="section-head"><div><p class="kicker">Reusable knowledge objects</p><h1>Knowledge Registry</h1></div><p>每个知识点都明确区分 statement、assumptions、does-not-imply 与 engineering implications。</p></div><div class="concept-list">${knowledge.map(k=>`<a href="${k.id}/index.html"><div>${badge(k.epistemicType)}<h2>${escapeHtml(k.titleZh)} <small>${escapeHtml(k.title)}</small></h2><p>${escapeHtml(k.summary)}</p></div><span>open →</span></a>`).join('')}</div></section>`;
  return shell({title:'Knowledge — Knowledge Atlas',body,root:'../',active:'knowledge'});
}
