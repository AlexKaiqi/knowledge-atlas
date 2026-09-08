// Public seed knowledge only. Pure HTML rendering; no DOM, fetch, or storage access.
const labels = Object.freeze({
  FORMAL_RESULT: '形式结论', FORMAL_MODEL: '数学模型', CONCEPTUAL_LAW: '概念规律',
  ENGINEERING_POLICY: '工程策略', HEURISTIC: '启发式', EMPIRICAL_FINDING: '经验发现',
  SYSTEMS_THEORY: '系统理论', EMPIRICAL_HEURISTIC: '经验假设',
  ENGINEERING_METHOD: '工程方法', ENGINEERING_PATTERN: '工程模式',
});
const relationLabels = Object.freeze({
  prerequisite: '理解时可先了解', explains: '用于解释', 'applies-to': '适用于',
  'example-of': '是这一知识的例子', 'contrasts-with': '可以对照', challenges: '提出质疑',
  related: '相关知识', USES: '使用这一知识',
});
const fieldLabels = Object.freeze({
  summary: '核心解释', statement: '准确陈述', intuition: '直觉解释', example: '具体例子',
  check: '自查问题', reviewer: '审阅者', name: '署名', kind: '审阅类型', date: '日期',
  at: '记录时间', notes: '审阅说明', result: '审阅结果', learnerReport: '试学报告',
  reason: '修改理由', sources: '依据', version: '版本', status: '状态',
});
const array = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const present = (value) => value !== null && value !== undefined && String(value).trim() !== '';
const text = (value) => typeof value === 'object' && value !== null ? JSON.stringify(value, null, 2) : String(value ?? '');
const escape = (value) => text(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const idPattern = /^[a-z0-9][a-z0-9-]*$/;
function rootPath(root) {
  return typeof root === 'string' && /^(?:(?:\.\.\/)*(?:\.\/)?|\/(?:[^\s<>"'\\?#:]+\/)*)$/.test(root) ? root : './';
}
function webUrl(value) {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f]/.test(value)) return null;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}
function external(value, label) {
  const href = webUrl(value);
  return href ? `<a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${escape(label || value)} ↗</a>` : escape(label || value);
}
function paragraph(value) {
  if (!present(value)) return '';
  return `<p>${escape(value).replace(/\r\n?|\n/g, '<br>')}</p>`;
}
function list(values) {
  const entries = array(values).filter(present);
  return entries.length ? `<ul>${entries.map((value) => `<li>${escape(value)}</li>`).join('')}</ul>` : '';
}
function metadata(value) {
  const entries = Object.entries(object(value)).filter(([, item]) => present(item));
  return entries.length ? `<dl>${entries.map(([key, item]) => `<dt>${escape(fieldLabels[key] || key)}</dt><dd>${typeof item === 'string' && webUrl(item) ? external(item) : escape(item)}</dd>`).join('')}</dl>` : '';
}
function sourceList(sources) {
  const values = array(sources);
  if (!values.length) return '<p>当前条目没有附可核查的来源记录，相关主张仍需补证。</p>';
  return `<ul class="source-list">${values.map((source) => {
    if (!source || typeof source !== 'object') return `<li>${escape(source)}</li>`;
    const { label, title, url, ...rest } = source;
    const caption = label || title || url || '未署名来源';
    return `<li>${external(url, caption)}${metadata(rest)}</li>`;
  }).join('')}</ul>`;
}
function findKnowledge(catalog, id) {
  if (catalog instanceof Map) return catalog.get(id) || catalog.get(`knowledge:${id}`);
  if (Array.isArray(catalog)) return catalog.find((item) => item.id === id);
  return object(catalog)[id] || object(catalog)[`knowledge:${id}`];
}
function knowledgeLink(id, label, root) {
  return idPattern.test(id || '') ? `<a href="${root}knowledge/${encodeURIComponent(id)}/index.html" data-public-knowledge="${escape(id)}">${escape(label || id)}</a>` : escape(label || id);
}
function relationTarget(target, catalog, root) {
  const raw = typeof target === 'string' ? target : '';
  const id = raw.startsWith('knowledge:') ? raw.slice(10) : raw;
  const entry = findKnowledge(catalog, id);
  if (entry || raw.startsWith('knowledge:')) return knowledgeLink(id, entry?.titleZh || entry?.title || id, root);
  const document = raw.match(/^document:([a-f0-9-]{36})$/);
  if (document) return `<a href="${root}index.html?doc=${encodeURIComponent(document[1])}">共享知识 ${escape(document[1])}</a>`;
  return escape(raw);
}
function revisionHistory(revisions) {
  const rows = array(revisions);
  if (!rows.length) return '<p>当前条目没有附录内修订记录；可在源文件历史中查看既有变更。</p>';
  return rows.map((row) => {
    const change = object(row);
    const summary = [present(change.version) ? `v${change.version}` : '一次修订', fieldLabels[change.field] || change.field, change.nickname || change.author, change.mergedAt || change.date].filter(present).join(' · ');
    const { beforeText, afterText, ...details } = change;
    return `<details class="review-block"><summary>${escape(summary)}</summary>${metadata(details)}${present(beforeText) ? `<h3>修改前</h3><pre class="artifact-meta">${escape(beforeText)}</pre>` : ''}${present(afterText) ? `<h3>修改后</h3><pre class="artifact-meta">${escape(afterText)}</pre>` : ''}</details>`;
  }).join('');
}

export function publicKnowledgeLabel(knowledge) {
  const k = object(knowledge);
  return text(k.titleZh || k.title || k.id || '知识条目');
}

export function renderPublicKnowledgeCard(knowledge, { guide = {}, root = './' } = {}) {
  const k = object(knowledge), g = object(guide), prefix = rootPath(root);
  const title = publicKnowledgeLabel(k);
  const content = `<span class="tag">${escape(labels[k.epistemicType] || k.epistemicType || '知识条目')}</span><h2>${escape(title)}</h2>${k.title && k.title !== title ? `<p class="muted">${escape(k.title)}</p>` : ''}${paragraph(g.question || k.summary)}`;
  return idPattern.test(k.id || '') ? `<a class="wiki-row public-knowledge-card" href="${prefix}knowledge/${encodeURIComponent(k.id)}/index.html" data-public-knowledge="${escape(k.id)}">${content}</a>` : `<article class="wiki-row public-knowledge-card">${content}</article>`;
}

/**
 * Existing seed entry + its matching guide. Returns the article body, not an app shell.
 * `root` is the current page's relative path to the site root (./, ../, ../../ or /).
 * `knowledgeById` may be a Map, object keyed by stable ID, or an entry array.
 * `relations` must already be authorized for the current reader; this renderer does not fetch.
 * Existing proposal/discussion controls are intentionally left to the workspace controller.
 */
export function renderPublicKnowledge({ knowledge, guide = {}, questions = [], relations = [], knowledgeById = {}, root = './' } = {}) {
  const k = object(knowledge), g = object(guide), prefix = rootPath(root);
  if (!present(k.id)) throw new TypeError('A public knowledge entry needs an id.');
  const title = publicKnowledgeLabel(k), anchor = idPattern.test(k.id) ? `knowledge-${k.id}` : 'knowledge-entry';
  const section = (name, heading, body) => body ? `<section id="${anchor}-${name}" class="public-knowledge-section"><h2>${escape(heading)}</h2>${body}</section>` : '';
  const relatedQuestions = array(questions).filter((q) => array(q?.knowledge).includes(k.id));
  const links = [...array(k.relations), ...array(relations)];
  const seen = new Set();
  const relationRows = links.filter((relation) => {
    const r = object(relation);
    const key = `${r.target}|${r.kind || r.type}|${r.reason || ''}`;
    if (!present(r.target) || seen.has(key)) return false;
    seen.add(key); return true;
  }).map((r) => `<li><strong>${escape(relationLabels[r.kind || r.type] || r.kind || r.type || '关联')}</strong> ${relationTarget(r.target, knowledgeById, prefix)}${present(r.reason) ? `：${escape(r.reason)}` : ''}</li>`);
  const questionLinks = relatedQuestions.map((q) => idPattern.test(q.id || '') ? `<li><a href="${prefix}questions/${encodeURIComponent(q.id)}/index.html">${escape(q.title || q.id)} →</a>${paragraph(q.summary)}</li>` : `<li>${escape(q.title || q.id)}</li>`);
  const neighbors = [...new Set(relatedQuestions.flatMap((q) => array(q.knowledge)).filter((id) => id !== k.id))].filter((id) => findKnowledge(knowledgeById, id));
  const reviewLabels = { 'editorial-draft': '编辑初稿', 'content-reviewed': '声明已做内容审阅', 'learner-tried': '声明已有试学' };
  const reviewEvidence = object(k.reviewEvidence);
  const reviews = array(k.reviews);
  const reviewBody = `${present(k.reviewStatus) ? paragraph(`记录的审阅状态：${reviewLabels[k.reviewStatus] || k.reviewStatus}`) : '<p>当前条目未附独立内容审阅或真人试学状态，不能据此宣称已经验证。</p>'}${metadata(reviewEvidence)}${reviews.map((r) => `<div class="review-block">${metadata(r)}</div>`).join('')}<p class="muted">正文发布、结构检查、内容审阅和真人试学分别记录；列出来源不等于每个解释都已得到验证。</p>`;
  const known = new Set(['id','title','titleZh','epistemicType','summary','statement','formula','assumptions','doesNotImply','engineeringImplications','sources','status','version','relations','reviewStatus','reviewEvidence','reviews','revisionHistory']);
  const extra = Object.fromEntries(Object.entries(k).filter(([key]) => !known.has(key)));
  const extraGuide = Object.fromEntries(Object.entries(g).filter(([key]) => !['question','intuition','example','check'].includes(key)));
  const historyUrl = idPattern.test(k.id) ? `https://github.com/AlexKaiqi/knowledge-atlas/commits/main/content/knowledge/${encodeURIComponent(k.id)}.json` : null;
  return `<article class="public-knowledge-reader markdown" data-public-knowledge-entry="${escape(k.id)}"><header><p class="overline">公共知识 · 欢迎追问与修订</p><h1>${escape(title)}</h1>${k.title && k.title !== title ? `<p class="muted">${escape(k.title)}</p>` : ''}${paragraph(g.question || k.summary)}<div class="tag-row"><span class="tag">${escape(labels[k.epistemicType] || k.epistemicType || '知识条目')}</span><span class="tag">正文 v${escape(k.version || 1)}</span><span class="tag">${escape(({ published: '已发布', draft: '草稿', archived: '已归档' })[k.status] || k.status || '状态未声明')}</span></div></header>${section('intuition','先建立直觉',paragraph(g.intuition) + (present(g.example) ? `<blockquote>${paragraph(g.example)}</blockquote>` : ''))}${section('statement','准确地说',paragraph(k.summary) + paragraph(k.statement) + (present(k.formula) ? `<pre class="formula">${escape(k.formula)}</pre>` : ''))}${section('boundary','在哪些条件下成立',list(k.assumptions) + (array(k.doesNotImply).length ? `<h3>这并不意味着</h3>${list(k.doesNotImply)}` : ''))}${section('practice','怎样用到实践中',list(k.engineeringImplications) + (present(g.check) ? `<div class="review-block"><h3>合上解释，试着想一想</h3>${paragraph(g.check)}</div>` : ''))}${section('relations','沿着问题继续探索',(questionLinks.length ? `<ul>${questionLinks.join('')}</ul>` : '') + (relationRows.length ? `<h3>与其他知识的关系</h3><ul>${relationRows.join('')}</ul>` : '') + (neighbors.length ? `<h3>这些问题还会用到</h3><ul>${neighbors.map((id) => `<li>${knowledgeLink(id, publicKnowledgeLabel(findKnowledge(knowledgeById,id)), prefix)}</li>`).join('')}</ul>` : ''))}${section('sources','从哪里继续查证',sourceList(k.sources) + '<p class="muted">来源与原文主张仍欢迎核查。既有参考资料包含二手入口，应分别检查来源是否支持具体主张。</p>')}${section('review','审阅与维护状态',reviewBody)}${section('history','版本与修订记录',revisionHistory(k.revisionHistory) + (historyUrl ? paragraph('源文件历史保留既有公开条目的变更。') + external(historyUrl,'查看源文件历史') : ''))}${Object.keys(extra).length || Object.keys(extraGuide).length ? `<details class="review-block"><summary>其他已保存资料</summary>${metadata(extra)}${metadata(extraGuide)}</details>` : ''}</article>`;
}
