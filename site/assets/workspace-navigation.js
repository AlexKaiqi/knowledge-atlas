// Browsing a scene and selecting an exploration are independent navigation state.
export const sceneLabels = { conversation: '正在探索', mine: '我的探索', shared: '一起探讨', knowledge: '知识库', practice: '动手实践' };
export function readWorkspaceRoute(url, defaults = {}) {
  const u = new URL(url);
  if (defaults.entryPath && defaults.entryPath !== u.pathname) defaults = {};
  const id = u.searchParams.get('s') || null;
  const value = u.searchParams.get('view') || (id && defaults.initialScene === 'mine' ? 'conversation' : defaults.initialScene) || (id ? 'conversation' : 'mine');
  const environment = u.searchParams.get('env') || '';
  const rawVersion = Number(u.searchParams.get('ev'));
  const environmentVersion = Number.isSafeInteger(rawVersion) && rawVersion > 0 ? rawVersion : null;
  const document = u.searchParams.get('doc') || '';
  const knowledge = document ? '' : u.searchParams.get('k') || (u.searchParams.has('view') ? '' : defaults.initialKnowledge || '');
  return { returnScene: ['mine','shared','practice'].includes(u.searchParams.get('from')) ? u.searchParams.get('from') : null, scene: knowledge || document ? 'knowledge' : environment ? 'practice' : Object.hasOwn(sceneLabels, value) ? value : 'conversation', id, knowledge, document, ...(environment ? { environment, environmentVersion } : {}) };
}
export function workspaceUrl(base, { scene = 'conversation', id, knowledge, document, returnScene, environment, environmentVersion } = {}) {
  const url = new URL('explore/', base);
  if (id) url.searchParams.set('s', id);
  if (scene !== 'conversation') url.searchParams.set('view', scene);
  if (knowledge) url.searchParams.set('k', knowledge);
  if (document) url.searchParams.set('doc', document);
  if (scene === 'practice' && environment) { url.searchParams.set('env', environment); if (environmentVersion) url.searchParams.set('ev', environmentVersion); }
  if (returnScene && scene === 'conversation') url.searchParams.set('from', returnScene);
  return url.pathname + url.search;
}
export function knowledgeContext(k, url) {
  return { kind: 'knowledge', sourceType: k.visibility ? 'document' : 'seed', visibility: k.visibility || 'public', id: k.id, title: k.titleZh || k.title, version: k.version || 1, url, summary: k.summary || '' };
}
export function contextualQuestion(body, context) {
  if (!context) return body;
  if (context.kind === 'knowledge') return `参考知识「${context.title}」v${context.version}\n${context.url}\n摘要：${context.summary}\n\n我的问题：${body}`;
  return `关于「${context.title}」v${context.version}\n\n${body}`;
}
