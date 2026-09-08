import { environmentEntry } from './workspace-environments.js';
const e = (x) => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function sceneHeading(label, text, action = '') {
  return `<div class="scene-heading"><div><p class="scene-eyebrow">知图 · ${e(label)}</p><h1 id="scene-title" tabindex="-1">${e(text)}</h1></div>${action}</div>`;
}
export function spaceScene(shared, root = "./") {
  if (!shared) return `${sceneHeading('我的探索', '今天，想弄明白什么？')}<p class="scene-intro">直接说出你的问题，一起往下探索。</p><div id="mine-composer" class="mine-composer"></div><p class="mine-privacy">新问题会保存为私人探索。</p><div class="scene-section-heading"><h2>继续之前的探索</h2><button class="subtle" data-action="search-history" aria-expanded="false" aria-controls="history-search">查找历史</button></div><div id="history-search" hidden><label class="scene-search">搜索历史探索<input type="search" id="scene-search" placeholder="查找之前讨论过的问题"></label></div><div id="scene-items" class="scene-list" aria-live="polite"><p class="scene-empty">正在读取探索…</p></div>`;
  return `${sceneHeading('一起探讨', '一个问题，可以一起想。', '<button class="primary" data-action="start-shared">发起共同讨论</button>')}<p class="scene-intro">看看别人正在追问什么。加入一段讨论，补充例子、提出异议，或者一起验证。</p><label class="scene-search">搜索共同讨论<input type="search" id="scene-search" placeholder="输入问题中的关键词"></label><div id="scene-items" class="scene-list" aria-live="polite"><p class="scene-empty">正在读取探索…</p></div><p class="scene-footnote">只有明确共享的探索出现在这里。<a href="${root}community/index.html">查看早期讨论与修订 →</a></p>`;
}
export function spaceCards(spaces, shared, query = '') {
  const list = spaces.filter(s => s.title.toLowerCase().includes(query.toLowerCase().trim()));
  if (!list.length) return `<div class="scene-empty"><h2>${query ? '没有找到这个问题' : shared ? '还没有共同讨论' : '这里会留下你的探索'}</h2><p>${query ? '可以换个关键词，或从这个问题开始。' : shared ? '从一个疑问开始，邀请大家一起把它想清楚。' : '提出一个问题，讨论和成果就会保存到这里。'}</p>${shared ? '<button class="secondary" data-action="start-shared">发起共同讨论</button>' : '<button class="secondary" data-action="focus-question">直接提问</button>'}</div>`;
  return list.map(s => `<button class="scene-row" data-space="${e(s.id)}"><span><span class="scene-meta">${s.visibility === 'shared' ? '本站共享' : '私人探索'} · ${s.role === 'owner' ? '我发起的' : s.role ? '已加入' : '可加入'}</span><h2>${e(s.title)}</h2><span class="scene-meta">最近更新 ${new Date(s.updatedAt).toLocaleDateString('zh-CN')}</span></span><span class="row-arrow" aria-hidden="true">→</span></button>`).join('');
}
export function knowledgeScene(knowledge, guides) {
  return `${sceneHeading('知识库', '查阅，也可以继续追问。')}<p class="scene-intro">从一个解释进入原理、依据与边界。读到疑问时，把它带回正在进行的探索。</p><label class="scene-search">搜索知识名称、问题或解释<input type="search" id="scene-search" placeholder="比如：第一性原理、因果、并行"></label><div class="scene-section-heading"><h2>开放知识</h2><span class="scene-meta">${knowledge.length} 个条目</span></div><div id="seed-items" class="scene-list">${knowledgeCards(knowledge, guides)}</div><div class="scene-section-heading"><h2>从探索中沉淀</h2><span class="scene-meta">按你的访问权限展示</span></div><div id="document-items" class="scene-list" aria-live="polite"><p class="scene-empty">正在读取知识修订…</p></div>`;
}
export function knowledgeCards(knowledge, guides, query = '') {
  const list = knowledge.filter(k => [k.titleZh, k.title, k.summary, guides[k.id]?.question].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  return list.length ? list.map(k => `<button class="scene-row" data-knowledge="${e(k.id)}"><span><span class="scene-meta">公开条目 · v${e(k.version || 1)}</span><h2>${e(k.titleZh || k.title)} <small>${e(k.title)}</small></h2><p>${e(guides[k.id]?.question || k.summary)}</p></span><span class="row-arrow" aria-hidden="true">→</span></button>`).join('') : `<div class="scene-empty"><h2>还没有收录这个概念</h2><p>知识库会逐步生长。可以先从你的问题开始探索。</p><button class="secondary" data-action="ask-search">把这个概念带回探索</button></div>`;
}
export function documentCards(documents, query = '') {
  const list = documents.filter(d => d.title.toLowerCase().includes(query.trim().toLowerCase()));
  return list.length ? list.map(d => `<button class="scene-row" data-open-document="${e(d.id)}"><span><span class="scene-meta">${d.visibility === 'shared' ? '本站共享' : '私人'} · ${d.status === 'maintained' ? '纳入维护' : d.status === 'archived' ? '已归档' : '草稿'} · v${e(d.version)}</span><h2>${e(d.title)}</h2></span><span class="row-arrow" aria-hidden="true">→</span></button>`).join('') : '<p class="scene-empty compact">暂无可见的匹配修订。探索里的笔记可以随时整理为知识草稿。</p>';
}
export const practiceModels = {
  parallel: { title: '人多，事情就会更快吗？', description: '改变可并行的比例和人手，观察整体速度的上限。', boundary: '理想数学模型，不包含沟通和协作成本。' },
  causal: { title: '带伞，反而更容易淋湿？', description: '先观察，再改变比较条件，看看结论为何不同。', boundary: '给定天气结构的玩具模型，不是现实测量。' }
};
export function practiceScene(root) {
  return `${sceneHeading('动手实践', '让想法，有地方试一试。')}${environmentEntry()}<div class="scene-section-heading"><h2>先试一个现成实验</h2></div><div class="practice-grid">${Object.entries(practiceModels).map(([kind, p]) => `<article class="practice-card"><span class="scene-meta">可调节的教学模型</span><div class="practice-sketch ${kind}" aria-hidden="true">${kind === 'parallel' ? '<i></i><i></i><i></i><i></i>' : '<i>观察</i><span>→</span><i>干预</i>'}</div><h2>${p.title}</h2><p>${p.description}</p><small>${p.boundary}</small><button class="primary" data-practice="${kind}">打开实验</button></article>`).join('')}</div><div class="scene-section-heading"><h2>做自己的尝试</h2></div><div class="practice-options"><button class="scene-row" data-action="practice-python"><span><h2>运行 Python 实验</h2><p>在独立环境中执行，把条件和结果留在探索里。</p></span><span>→</span></button><button class="scene-row" data-action="practice-import"><span><h2>带回 Agent 做出的成果</h2><p>导入报告或交互页面，保留每一个版本。</p></span><span>→</span></button></div><p class="scene-footnote"><a href="${root}with-agent/index.html">用自己的 Agent 和仓库环境继续 →</a><a href="${root}cases/tests-green-wrong/index.html">查看验收条件教学案例 →</a><a href="${root}notebook/index.html">查看早期实验记录 →</a></p>`;
}
