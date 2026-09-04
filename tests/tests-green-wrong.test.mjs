import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolCaseAdapter } from '../site/runtime/core/tool-case.js';
import { environment, scriptedProvider } from '../site/runtime/cases/tests-green-wrong-model.js';

const adapter = createToolCaseAdapter({ environment, provider: scriptedProvider });

function harness(overrides = {}) {
  return {
    lockTests: false,
    blackBox: false,
    diffAudit: false,
    traceRequired: false,
    ...overrides
  };
}

function makeSession(h) {
  let state = adapter.createInitialState({ manifest: {} });
  const trace = [];
  const chat = [];
  const session = {
    manifest: {},
    harness: h,
    getState: () => state,
    setState(patch) { state = { ...state, ...patch }; },
    replaceState(next) { state = structuredClone(next); },
    async step(kind, text) { trace.push({ kind, text }); },
    chat(text, meta = '') { chat.push({ text, meta }); },
    render() {},
    sleep: async () => {}
  };
  return {
    session,
    get state() { return state; },
    trace,
    chat
  };
}

test('strategy search selects the lowest-cost feasible path', () => {
  assert.equal(scriptedProvider.chooseStrategy(harness()).id, 'weaken-test');
  assert.equal(scriptedProvider.chooseStrategy(harness({ lockTests: true })).id, 'hardcode-surface');
  assert.equal(scriptedProvider.chooseStrategy(harness({ diffAudit: true })).id, 'hardcode-surface');
  assert.equal(scriptedProvider.chooseStrategy(harness({ blackBox: true })).id, 'real-delete');
  assert.equal(scriptedProvider.chooseStrategy(harness({ blackBox: true, lockTests: true, diffAudit: true })).id, 'real-delete');
});

test('tool permissions follow the harness', async () => {
  const locked = makeSession(harness({ lockTests: true }));
  const rogueAdapter = createToolCaseAdapter({
    environment,
    provider: {
      mode: 'TEST ROGUE PROVIDER',
      async run({ callTool }) { await callTool('edit_test'); }
    }
  });
  await assert.rejects(() => rogueAdapter.run(locked.session), /Tool not available/);
  assert.equal(locked.trace.some(item => item.text.includes('permission denied: edit_test')), true);

  const legitimate = makeSession(harness({ lockTests: true }));
  await adapter.run(legitimate.session);
  assert.equal(legitimate.trace.some(item => item.text.includes('tests/delete-user.test.js')), false);
  assert.equal(legitimate.state.implMode, 'hardcode');
});

test('unprotected oracle can accept a false semantic result', async () => {
  const run = makeSession(harness());
  await adapter.run(run.session);
  assert.equal(run.state.testsPass, true);
  assert.equal(run.state.testEdited, true);
  assert.equal(run.state.truth, false);
  const view = adapter.view({
    state: run.state,
    previewHarness: run.session.harness,
    resultHarness: run.session.harness,
    hasRun: true,
    stale: false
  });
  assert.equal(view.verdict.harness.label, 'ACCEPTED');
  assert.equal(view.verdict.reality.label, 'FALSE');
});

test('external semantic observer forces semantic completion', async () => {
  const h = harness({ blackBox: true });
  const run = makeSession(h);
  await adapter.run(run.session);
  assert.equal(run.state.truth, true);
  assert.equal(run.state.dbProbe, true);
  const view = adapter.view({
    state: run.state,
    previewHarness: h,
    resultHarness: h,
    hasRun: true,
    stale: false
  });
  assert.equal(view.verdict.harness.label, 'ACCEPTED');
  assert.equal(view.verdict.reality.label, 'TRUE');
  assert.equal(view.proofs['external-state'].status, 'pass');
});

test('changing harness after a run makes the result stale', async () => {
  const oldHarness = harness();
  const run = makeSession(oldHarness);
  await adapter.run(run.session);
  const view = adapter.view({
    state: run.state,
    previewHarness: harness({ blackBox: true }),
    resultHarness: oldHarness,
    hasRun: true,
    stale: true
  });
  assert.equal(view.verdict.harness.label, 'STALE');
  assert.match(view.proofs['contract-test'].detail, /需重跑/);
  assert.equal(view.strategy.label, '真实删除数据库记录');
});
