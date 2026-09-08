// Public seed proposals retain their existing API and review workflow.
export async function publicApi(route, body) {
  const session = await fetch('/api/session');
  if (!session.ok) throw new Error('共建服务未连接，请稍后重试。');
  const response = await fetch(`/api/${route}`, { method: body ? 'POST' : 'GET', headers: body ? { 'content-type': 'application/json' } : {}, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '未能保存，请保留输入后重试。');
  return result;
}
export function proposalHistory(revisions, e) {
  return revisions.length ? revisions.map(r => `<details class="review-block"><summary>${r.status === 'merged' ? '已合入' : r.status === 'rejected' ? '已关闭' : '待审阅'} · ${e(r.nickname)} · 基于 v${e(r.baseVersion)}</summary><p>${e(r.reason)}</p><h3>修改前</h3><pre class="artifact-meta">${e(r.beforeText)}</pre><h3>提案内容</h3><pre class="artifact-meta">${e(r.afterText)}</pre><p>依据：${e(r.sources)}</p><button class="secondary" data-proposal-download="${e(r.id)}">导出提案</button></details>`).join('') : '<p class="scene-empty compact">还没有修订提案。更清楚的解释可以从一个例子开始。</p>';
}
