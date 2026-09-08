// Copy into tests/ in the parent's isolated test mirror; no model or server process is started.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../server/api.mjs';
import { openLocalDatabase } from '../server/local-db.mjs';
import { claimCodexJob, finishCodexJob } from '../server/codex-jobs.mjs';
import { applyCodexEvent, newCodexProgress, saveCodexProgress } from '../server/codex-progress.mjs';
import { newerJob } from '../site/assets/agent-live.js';

const mutation = body => ({ ...body, requestId: crypto.randomUUID() });
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-progress-test-'));
  const db = openLocalDatabase(path.join(dir, 'db.sqlite'), new URL('../drizzle', import.meta.url).pathname);
  const api = createApi({ catalog: {}, agent: { available: true, version: 'fixture-only' } });
  const streams = [];
  async function response(route, body, cookie = '', signal) {
    return api(new Request('http://localhost/api/workspace' + route, {
      method: body ? 'POST' : 'GET', signal,
      headers: { cookie, ...(body ? { 'content-type': 'application/json', origin: 'http://localhost' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }), db);
  }
  async function call(route, body, cookie) {
    const r = await response(route, body, cookie);
    return { status: r.status, data: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] };
  }
  async function stream(space, cookie) {
    const abort = new AbortController();
    const r = await response(`/spaces/${space}/events`, null, cookie, abort.signal);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /^text\/event-stream/);
    const reader = r.body.getReader(), decoder = new TextDecoder();
    let buffer = '';
    const timer = setTimeout(() => abort.abort(new Error('SSE test timed out')), 4000);
    const close = async () => { clearTimeout(timer); abort.abort(); await reader.cancel().catch(() => {}); };
    streams.push(close);
    async function next() {
      for (;;) {
        const boundary = buffer.indexOf('\n\n');
        if (boundary >= 0) {
          const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
          const event = frame.split('\n').find(line => line.startsWith('event: '))?.slice(7);
          const json = frame.split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('\n');
          return { event, data: json ? JSON.parse(json) : null };
        }
        const { done, value } = await reader.read();
        if (done) return null;
        buffer += decoder.decode(value, { stream: true });
      }
    }
    async function until(predicate) {
      for (let n = 0; n < 30; n++) {
        const event = await next();
        assert.ok(event, 'stream closed before expected event');
        if (predicate(event)) return event;
      }
      assert.fail('expected event was not observed');
    }
    return { next, until, close };
  }
  return { db, call, stream, async cleanup() { await Promise.all(streams.map(close => close())); db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}
const progressText = job => (job.progress?.items || []).filter(item => item.type === 'message').map(item => item.text).join('');
const hasJob = (frame, id, predicate) => frame?.event === 'jobs' && frame.data.jobs.some(job => job.id === id && predicate(job));

test('API SSE delivers partial Chinese text before the final message; reconnect only observes the same job', async () => {
  const x = setup();
  try {
    const owner = (await x.call('/session')).cookie;
    const created = await x.call('/spaces', mutation({ body: '为什么先预测再实验？' }), owner);
    assert.equal(created.status, 201);
    const { id, jobId } = created.data;
    const claimed = await claimCodexJob(x.db, jobId);
    const stream = await x.stream(id, owner);
    await stream.until(frame => hasJob(frame, jobId, job => job.status === 'running'));
    const progress = newCodexProgress();
    applyCodexEvent(progress, { method: 'item/agentMessage/delta', params: { itemId: 'answer-1', delta: '先写下预测，' } });
    assert.equal(await saveCodexProgress(x.db, claimed, progress), true);
    const partial = await stream.until(frame => hasJob(frame, jobId, job => progressText(job) === '先写下预测，'));
    assert.equal(partial.data.jobs.find(job => job.id === jobId).status, 'running');
    assert.equal((await x.call(`/spaces/${id}`, null, owner)).data.messages.filter(message => message.kind === 'assistant').length, 0);

    await stream.close();
    const resumed = await x.stream(id, owner);
    await resumed.until(frame => hasJob(frame, jobId, job => progressText(job) === '先写下预测，'));
    assert.equal((await x.db.prepare('SELECT COUNT(*) AS n FROM ws_jobs WHERE space=?').bind(id).first()).n, 1);
    assert.equal((await x.db.prepare('SELECT attempt FROM ws_jobs WHERE id=?').bind(jobId).first()).attempt, 1);

    applyCodexEvent(progress, { method: 'item/agentMessage/delta', params: { itemId: 'answer-1', delta: '再比较实际结果。🧪' } });
    assert.equal(await saveCodexProgress(x.db, claimed, progress), true);
    await resumed.until(frame => hasJob(frame, jobId, job => progressText(job).endsWith('🧪')));
    assert.equal(await finishCodexJob(x.db, claimed, '先写下预测，再比较实际结果。🧪'), true);
    await resumed.until(frame => hasJob(frame, jobId, job => job.status === 'succeeded'));
    const saved = (await x.call(`/spaces/${id}`, null, owner)).data.messages.filter(message => message.kind === 'assistant');
    assert.equal(saved.length, 1);
    assert.equal(saved[0].id, jobId);
    assert.equal(saved[0].body, '先写下预测，再比较实际结果。🧪');
    assert.equal((await resumed.until(frame => frame.event === 'settled')).event, 'settled');
    assert.equal(await resumed.next(), null);
  } finally { await x.cleanup(); }
});

test('cancellation rejects late progress and final writes without losing accepted partial text', async () => {
  const x = setup();
  try {
    const owner = (await x.call('/session')).cookie;
    const { id, jobId } = (await x.call('/spaces', mutation({ body: '取消这次推演' }), owner)).data;
    const claimed = await claimCodexJob(x.db, jobId), progress = newCodexProgress();
    applyCodexEvent(progress, { method: 'item/agentMessage/delta', params: { itemId: 'partial', delta: '已接受的部分内容' } });
    assert.equal(await saveCodexProgress(x.db, claimed, progress), true);
    const before = await x.db.prepare('SELECT progress,progress_version FROM ws_jobs WHERE id=?').bind(jobId).first();
    assert.equal((await x.call(`/spaces/${id}/jobs/${jobId}/cancel`, {}, owner)).status, 200);
    applyCodexEvent(progress, { method: 'item/agentMessage/delta', params: { itemId: 'partial', delta: '不应写入的迟到内容' } });
    assert.equal(await saveCodexProgress(x.db, claimed, progress), false);
    assert.equal(await finishCodexJob(x.db, claimed, '不应写入的最终回答'), false);
    const after = await x.db.prepare('SELECT status,progress,progress_version FROM ws_jobs WHERE id=?').bind(jobId).first();
    assert.equal(after.status, 'cancelled');
    assert.equal(after.progress, before.progress);
    assert.equal(after.progress_version, before.progress_version);
    assert.equal((await x.call(`/spaces/${id}`, null, owner)).data.messages.filter(message => message.kind === 'assistant').length, 0);
  } finally { await x.cleanup(); }
});

test('revoking public access closes an existing outsider stream and rejects reconnection', async () => {
  const x = setup();
  try {
    const owner = (await x.call('/session')).cookie, outsider = (await x.call('/session')).cookie;
    const { id, jobId } = (await x.call('/spaces', mutation({ body: '公开探索随后收回', visibility: 'shared' }), owner)).data;
    const stream = await x.stream(id, outsider);
    await stream.until(frame => hasJob(frame, jobId, job => job.status === 'queued'));
    assert.equal((await x.call(`/spaces/${id}/share`, { visibility: 'private', baseVersion: 1 }, owner)).status, 200);
    assert.equal((await stream.until(frame => frame.event === 'denied')).event, 'denied');
    assert.equal(await stream.next(), null);
    assert.equal((await x.call(`/spaces/${id}/events`, null, outsider)).status, 404);
  } finally { await x.cleanup(); }
});

test('newerJob rejects stale snapshots and terminal-to-active rollback', () => {
  const running = { id: 'j', status: 'running', updatedAt: 100, progressVersion: 3 };
  const stale = { ...running, progressVersion: 2 };
  assert.equal(newerJob(running, stale), running);
  assert.equal(newerJob(running, { ...running, updatedAt: 99, progressVersion: 20 }), running);
  const advanced = { ...running, progressVersion: 4 };
  assert.equal(newerJob(running, advanced), advanced);
  const terminal = { ...advanced, status: 'succeeded', updatedAt: 110 };
  assert.equal(newerJob(advanced, terminal), terminal);
  assert.equal(newerJob(terminal, { ...running, updatedAt: 120, progressVersion: 50 }), terminal);
  assert.equal(newerJob(null, running), running);
});
