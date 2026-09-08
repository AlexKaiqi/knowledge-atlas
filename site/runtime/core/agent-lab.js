function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sameHarness(a, b) {
  return JSON.stringify(a || {}) === JSON.stringify(b || {});
}

function readManifest(root) {
  const node = root.querySelector('[data-case-manifest]');
  if (!node) throw new Error('Missing [data-case-manifest]');
  return JSON.parse(node.textContent);
}

export function mountCaseLab(root, adapter) {
  if (!root) return;
  if (!adapter || typeof adapter.createInitialState !== 'function' || typeof adapter.view !== 'function' || typeof adapter.run !== 'function') {
    throw new Error('Invalid Case Runtime adapter');
  }

  const manifest = readManifest(root);
  const ui = {
    run: root.querySelector('[data-lab-run]'),
    save: root.querySelector('[data-save-agent]'),
    reset: root.querySelector('[data-lab-reset]'),
    freshness: root.querySelector('[data-run-freshness]'),
    strategy: root.querySelector('[data-lab-strategy]'),
    strategyKind: root.querySelector('[data-lab-strategy-kind]'),
    terminal: root.querySelector('[data-lab-terminal]'),
    harnessVerdict: root.querySelector('[data-harness-verdict]'),
    realityVerdict: root.querySelector('[data-reality-verdict]'),
    confidence: root.querySelector('[data-confidence]'),
    confidenceBar: root.querySelector('[data-confidence-bar]'),
    agentLog: root.querySelector('[data-agent-log]'),
    agentForm: root.querySelector('[data-agent-form]'),
    agentInput: root.querySelector('[data-agent-input]'),
    quickPrompts: [...root.querySelectorAll('[data-agent-quick]')],
    agentMode: root.querySelector('[data-agent-mode]'),
    history: root.querySelector('[data-run-history]')
  };

  const harnessInputs = [...root.querySelectorAll('[data-harness-id]')];
  const fieldNodes = new Map([...root.querySelectorAll('[data-case-field]')].map(node => [node.dataset.caseField, node]));
  const proofNodes = new Map([...root.querySelectorAll('[data-proof-id]')].map(node => [node.dataset.proofId, node]));

  let state = adapter.createInitialState({ manifest });
  let running = false;
  let hasRun = false;
  let runCounter = 0;
  let lastRunHarness = null;
  let runHistory = [];

  if (ui.agentMode) ui.agentMode.textContent = adapter.mode || 'CASE RUNTIME';

  function currentHarness() {
    return Object.fromEntries(harnessInputs.map(input => [input.dataset.harnessId, Boolean(input.checked)]));
  }

  function resultHarness() {
    return lastRunHarness || currentHarness();
  }

  function isStale() {
    return hasRun && !sameHarness(currentHarness(), lastRunHarness);
  }

  function setProof(node, proof = {}) {
    if (!node) return;
    const status = proof.status || 'idle';
    node.dataset.status = status;
    const badge = node.querySelector('b');
    const small = node.querySelector('small');
    if (badge) badge.textContent = status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : status === 'off' ? 'OFF' : status === 'stale' ? 'STALE' : '—';
    if (small) small.textContent = proof.detail || '—';
  }

  function renderHistory() {
    if (!ui.history) return;
    if (!runHistory.length) {
      ui.history.innerHTML = '<div class="history-empty">还没有实验记录。每次 Run 都会留下 Harness 快照、Agent 策略和验收结果。</div>';
      return;
    }
    ui.history.innerHTML = runHistory.map(run => {
      const enabled = Object.entries(run.harness).filter(([, value]) => value).map(([key]) => manifest.harnessControls.find(x => x.id === key)?.label || key);
      return `<div class="history-run" data-history-run="${run.id}"><div class="history-index">#${run.id}</div><div><b>${escapeText(run.strategy)}</b><small>${escapeText(enabled.length ? enabled.join(' · ') : 'No extra harness')}</small></div><div class="history-verdict"><span data-ok="${run.accepted ? 'yes' : 'no'}">${run.accepted ? 'ACCEPTED' : 'REJECTED'}</span><span data-ok="${run.truth ? 'yes' : 'no'}">REALITY ${run.truth ? 'TRUE' : 'FALSE'}</span></div><button type="button" data-history-replay="${run.id}">Replay</button></div>`;
    }).join('');
  }

  function escapeText(value = '') {
    return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }

  function render() {
    if (ui.save) ui.save.disabled = running || !hasRun || isStale() || runHistory.at(-1)?.id !== runCounter;
    const preview = currentHarness();
    const evaluated = resultHarness();
    const view = adapter.view({
      manifest,
      state,
      previewHarness: preview,
      resultHarness: evaluated,
      hasRun,
      stale: isStale()
    });

    if (ui.strategy) ui.strategy.textContent = view.strategy?.label || '—';
    if (ui.strategyKind) ui.strategyKind.textContent = view.strategy?.meta || '';

    for (const [id, node] of fieldNodes) {
      if (view.fields && id in view.fields) node.textContent = view.fields[id];
    }
    for (const [id, node] of proofNodes) setProof(node, view.proofs?.[id]);

    const harnessVerdict = view.verdict?.harness || { label: hasRun ? 'UNKNOWN' : 'NOT RUN', ok: 'idle' };
    const realityVerdict = view.verdict?.reality || { label: hasRun ? 'UNKNOWN' : 'UNKNOWN', ok: 'idle' };
    if (ui.harnessVerdict) {
      ui.harnessVerdict.textContent = harnessVerdict.label;
      ui.harnessVerdict.dataset.ok = harnessVerdict.ok || 'idle';
    }
    if (ui.realityVerdict) {
      ui.realityVerdict.textContent = realityVerdict.label;
      ui.realityVerdict.dataset.ok = realityVerdict.ok || 'idle';
    }

    const confidence = Math.max(0, Math.min(99, Number(view.confidence?.percent ?? 10)));
    if (ui.confidence) {
      ui.confidence.textContent = `${Math.round(confidence)}%`;
      ui.confidence.title = view.confidence?.detail || '';
    }
    if (ui.confidenceBar) ui.confidenceBar.style.width = `${confidence}%`;

    if (ui.freshness) {
      if (!hasRun) {
        ui.freshness.textContent = 'NOT RUN';
        ui.freshness.dataset.state = 'idle';
      } else if (isStale()) {
        ui.freshness.textContent = 'HARNESS CHANGED · RERUN';
        ui.freshness.dataset.state = 'stale';
      } else {
        ui.freshness.textContent = `RUN #${runCounter} · FRESH`;
        ui.freshness.dataset.state = 'fresh';
      }
    }
    renderHistory();
  }

  function terminalLine(kind, text) {
    const line = document.createElement('div');
    line.className = `terminal-line ${kind}`;
    line.innerHTML = `<span>${kind === 'tool' ? 'tool' : kind === 'ok' ? '✓' : kind === 'warn' ? '!' : '·'}</span><code></code>`;
    line.querySelector('code').textContent = text;
    ui.terminal.append(line);
    ui.terminal.scrollTop = ui.terminal.scrollHeight;
  }

  function addChat(role, text, meta = '') {
    if (!ui.agentLog) return;
    const row = document.createElement('div');
    row.className = `chat-row ${role}`;
    row.innerHTML = `<div class="chat-meta">${role === 'user' ? 'YOU' : 'LAB AGENT'}${meta ? ` · ${escapeText(meta)}` : ''}</div><div class="chat-bubble"></div>`;
    row.querySelector('.chat-bubble').textContent = text;
    ui.agentLog.append(row);
    ui.agentLog.scrollTop = ui.agentLog.scrollHeight;
  }

  function resetCurrent({ keepChat = true } = {}) {
    if (running) return;
    state = adapter.createInitialState({ manifest });
    running = false;
    hasRun = false;
    lastRunHarness = null;
    if (ui.terminal) ui.terminal.innerHTML = '<div class="terminal-placeholder">等待 Agent 执行。这里记录工具调用与 observer 输出，而不是完成态自然语言。</div>';
    if (!keepChat && ui.agentLog) {
      ui.agentLog.innerHTML = '';
      addChat('agent', adapter.intro || '我是这个 Case 的实验 Agent。改变 Harness 后让我重跑，比较轨迹与证据。', adapter.mode || 'runtime');
    }
    render();
  }

  function makeSession(harnessSnapshot) {
    return {
      manifest,
      harness: clone(harnessSnapshot),
      getState: () => state,
      setState(patch) {
        state = { ...state, ...clone(patch) };
        render();
      },
      replaceState(nextState) {
        state = clone(nextState);
        render();
      },
      async step(kind, text, delay = 140) {
        terminalLine(kind, text);
        if (delay > 0) await sleep(delay);
      },
      chat(text, meta = '') {
        addChat('agent', text, meta);
      },
      render,
      sleep
    };
  }

  function captureHistory(harnessSnapshot) {
    const view = adapter.view({
      manifest,
      state,
      previewHarness: harnessSnapshot,
      resultHarness: harnessSnapshot,
      hasRun: true,
      stale: false
    });
    runHistory.push({
      id: runCounter,
      harness: clone(harnessSnapshot),
      strategy: view.strategy?.label || 'Unknown strategy',
      accepted: view.verdict?.harness?.ok === 'yes',
      truth: view.verdict?.reality?.ok === 'yes',
      confidence: view.confidence?.percent ?? null
    });
    root.dispatchEvent(new CustomEvent('atlas:agent-run',{bubbles:true,detail:{...clone(runHistory.at(-1)),caseId:manifest.id,caseVersion:manifest.version,recordedAt:Date.now()}}));
  }

  async function runAgent(origin = 'button') {
    if (running) return;
    state = adapter.createInitialState({ manifest });
    running = true;
    hasRun = false;
    lastRunHarness = clone(currentHarness());
    runCounter += 1;
    if (ui.run) ui.run.disabled = true;
    if (ui.reset) ui.reset.disabled = true;
    if (ui.terminal) ui.terminal.innerHTML = '';
    if (origin !== 'chat' && origin !== 'replay') addChat('user', '请你自己解决这个任务，直到你认为可以交付。');
    render();

    const session = makeSession(lastRunHarness);
    try {
      await adapter.run(session);
      hasRun = true;
      captureHistory(lastRunHarness);
    } catch (error) {
      await session.step('warn', `runtime error: ${error?.message || error}`, 0);
      hasRun = true;
    } finally {
      running = false;
      if (ui.run) ui.run.disabled = false;
      if (ui.reset) ui.reset.disabled = false;
      render();
    }
  }

  async function handlePrompt(message) {
    const text = String(message || '').trim();
    if (!text) return;
    addChat('user', text);
    if (/自己解决|执行|run|do it|开始/i.test(text)) {
      await runAgent('chat');
      return;
    }
    const response = typeof adapter.respond === 'function'
      ? await adapter.respond({
          message: text,
          manifest,
          state,
          previewHarness: currentHarness(),
          resultHarness: resultHarness(),
          hasRun,
          stale: isStale(),
          history: clone(runHistory)
        })
      : '这个 Case Runtime 没有定义对话策略。';
    addChat('agent', response, adapter.mode || 'runtime');
  }

  for (const input of harnessInputs) {
    input.addEventListener('change', () => render());
  }
  ui.run?.addEventListener('click', () => runAgent('button'));
  ui.reset?.addEventListener('click', () => resetCurrent({ keepChat: true }));
  ui.agentForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const text = ui.agentInput.value;
    ui.agentInput.value = '';
    await handlePrompt(text);
  });
  for (const button of ui.quickPrompts) {
    button.addEventListener('click', () => handlePrompt(button.dataset.agentQuick));
  }
  ui.history?.addEventListener('click', event => {
    if (running) return;
    const button = event.target.closest('[data-history-replay]');
    if (!button) return;
    const id = Number(button.dataset.historyReplay);
    const run = runHistory.find(item => item.id === id);
    if (!run) return;
    for (const input of harnessInputs) input.checked = Boolean(run.harness[input.dataset.harnessId]);
    addChat('user', `Replay run #${id} with the same Harness snapshot.`);
    runAgent('replay');
  });

  resetCurrent({ keepChat: false });

  return {
    run: runAgent,
    reset: resetCurrent,
    getSnapshot() {
      return {
        state: clone(state),
        harness: clone(currentHarness()),
        hasRun,
        stale: isStale(),
        history: clone(runHistory)
      };
    }
  };
}
