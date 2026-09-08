import test from "node:test";
import assert from "node:assert/strict";
import { shouldSendOnEnter, isVoiceShortcut, normalizeInputMode, appendTranscript, createComposerInput } from "../site/assets/composer-input.js";
import { agentPresentation, replyRequestTarget, visibleWorkspaceJobs } from "../site/assets/agent-status.js";

test("Enter sends; Shift+Enter, Alt+Enter and held Enter never send", () => {
  assert.equal(shouldSendOnEnter({ key: "Enter" }), true);
  assert.equal(shouldSendOnEnter({ key: "Enter", ctrlKey: true }), true);
  assert.equal(shouldSendOnEnter({ key: "Enter", shiftKey: true }), false);
  assert.equal(shouldSendOnEnter({ key: "Enter", altKey: true }), false);
  assert.equal(shouldSendOnEnter({ key: "Enter", repeat: true }), false);
  assert.equal(shouldSendOnEnter({ key: "a" }), false);
});

test("IME candidate confirmation cannot send, including compositionend before keydown", () => {
  assert.equal(shouldSendOnEnter({ key: "Enter", isComposing: true }), false);
  assert.equal(shouldSendOnEnter({ key: "Enter", keyCode: 229 }), false);
  assert.equal(shouldSendOnEnter({ key: "Enter" }, { composing: true }), false);
  assert.equal(shouldSendOnEnter({ key: "Enter" }, { compositionEndedAt: 1000, now: 1001 }), false);
  assert.equal(shouldSendOnEnter({ key: "Enter" }, { compositionEndedAt: 1000, now: 1251 }), true);
});

test("voice shortcut works on Mac and other desktops without intercepting ordinary Space or IME", () => {
  const event = { code: "Space", shiftKey: true, metaKey: true };
  assert.equal(isVoiceShortcut(event), true);
  assert.equal(isVoiceShortcut({ key: " ", shiftKey: true, ctrlKey: true }), true);
  for (const patch of [{ shiftKey: false }, { metaKey: false }, { altKey: true }, { repeat: true }, { isComposing: true }, { keyCode: 229 }])
    assert.equal(isVoiceShortcut({ ...event, ...patch }), false);
  assert.equal(isVoiceShortcut(event, { compositionEndedAt: 100, now: 101 }), false);
});

test("saved mode accepts only known choices and transcription preserves existing drafts", () => {
  assert.equal(normalizeInputMode("voice"), "voice");
  for (const value of [null, "", "text", "unexpected"]) assert.equal(normalizeInputMode(value), "text");
  assert.deepEqual(appendTranscript("原来的草稿", "补充一句"), { text: "原来的草稿\n补充一句", truncated: false });
  assert.deepEqual(appendTranscript("原来的草稿\n", "  补充一句  "), { text: "原来的草稿\n补充一句", truncated: false });
  assert.deepEqual(appendTranscript("草稿", "  "), { text: "草稿", truncated: false });
  assert.deepEqual(appendTranscript("1234", "5678", 6), { text: "1234\n5", truncated: true });
});

test("agent availability and work state reflect capabilities and real Codex jobs", () => {
  assert.equal(agentPresentation().state, "unknown");
  const offline = agentPresentation({ agent: false, agentName: "Codex", agentReason: "CLI 未登录" });
  assert.equal(offline.state, "unavailable");
  assert.ok(offline.text.includes("CLI 未登录"));
  const capabilities = { agent: true, agentName: "Codex" };
  assert.equal(agentPresentation(capabilities, [{ runner: "agent", status: "waiting_provider" }]).state, "connected");
  assert.match(agentPresentation(capabilities, [{ runner: "codex", status: "queued" }]).text, /等待回答/);
  assert.match(agentPresentation(capabilities, [{ runner: "codex", status: "running" }]).text, /正在回答/);
  assert.equal(agentPresentation(capabilities, [{ runner: "codex", status: "failed" }]).state, "connected");
});

test("only the latest unanswered human message offers a fresh AI request", () => {
  const first = { id: "a", kind: "human" }, latest = { id: "b", kind: "human" };
  assert.equal(replyRequestTarget([first, latest]).id, "b");
  assert.equal(replyRequestTarget([first, latest, { kind: "assistant", replyTo: "a" }]).id, "b");
  assert.equal(replyRequestTarget([first, latest, { kind: "assistant", replyTo: "b" }]), null);
  assert.equal(replyRequestTarget([{ id: "legacy" }]).id, "legacy");
  assert.equal(replyRequestTarget([]), null);
  for (const status of ["queued", "running", "failed", "cancelled", "succeeded"])
    assert.equal(replyRequestTarget([latest], [{ runner: "codex", messageId: "b", status }]), null);
  assert.equal(replyRequestTarget([latest], [{ runner: "codex", messageId: "a", status: "running" }]).id, "b");
});

test("job cards show only the newest Codex attempt and hide successful answer cards", () => {
  const jobs = [
    { id: "latest-a", messageId: "a", runner: "codex", status: "succeeded" },
    { id: "latest-b", messageId: "b", runner: "codex", status: "running" },
    { id: "old-a", messageId: "a", runner: "codex", status: "failed" },
    { id: "old-b", messageId: "b", runner: "codex", status: "cancelled" },
    { id: "experiment", runner: "docker", status: "succeeded" },
  ];
  assert.deepEqual(visibleWorkspaceJobs(jobs).map((job) => job.id), ["latest-b", "experiment"]);
});

function voiceFixture(t, savedMode = "text") {
  const elements = new Map();
  function element(name) {
    if (!elements.has(name)) elements.set(name, {
      value: "", maxLength: 12000, dataset: {}, disabled: false,
      classList: { toggle() {} }, listeners: {},
      setAttribute(name, value) { this[name] = value; },
      addEventListener(type, listener) { this.listeners[type] = listener; },
      focus() { this.focused = true; },
    });
    return elements.get(name);
  }
  const modes = ["text", "voice"].map((mode) => Object.assign(element(mode), { dataset: { inputMode: mode } }));
  const form = element("#composer"), send = element(".send-button");
  let submitted = 0, scope = { id: "first", epoch: 1 }, draft = "";
  form.querySelector = () => send;
  form.querySelectorAll = () => modes;
  form.requestSubmit = () => submitted++;
  const instances = [];
  class Recognition {
    constructor() { instances.push(this); }
    start() { this.onstart?.(); }
    stop() { this.stopped = true; this.onend?.(); }
    abort() { this.aborted = true; this.onend?.(); }
    result(text) { this.onresult?.({ results: [[{ transcript: text }]] }); }
  }
  const stored = new Map([["atlas-input-mode", savedMode]]);
  const globals = {
    document: { querySelector: element, querySelectorAll: () => [element("mic")] },
    window: { SpeechRecognition: Recognition },
    localStorage: { getItem: (key) => stored.get(key), setItem: (key, value) => stored.set(key, value) },
  };
  const previous = Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const controller = createComposerInput({
    getScope: () => ({ ...scope }), getDisabled: () => false, getBusy: () => false,
    onDraft: () => { draft = element("#question-input").value; }, beforeVoice: () => true,
  });
  t.after(() => {
    controller.stop({ abort: true });
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return {
    controller, element, instances, stored, send,
    get submitted() { return submitted; }, get draft() { return draft; },
    switchScope() { scope = { id: "second", epoch: 2 }; },
  };
}

test("remembered voice mode never opens the microphone until clicked; stopping requires a separate send", (t) => {
  const f = voiceFixture(t, "voice"), input = f.element("#question-input");
  assert.equal(f.instances.length, 0);
  assert.equal(f.element("#composer-voice").hidden, false);
  input.value = "原草稿";
  f.controller.toggleVoice();
  assert.equal(input.readOnly, true);
  f.instances[0].result("补充内容");
  assert.equal(input.value, "原草稿\n补充内容");
  assert.equal(f.draft, input.value);
  assert.equal(f.send.disabled, true);
  f.controller.stop();
  assert.equal(input.readOnly, false);
  assert.equal(f.send.disabled, false);
  assert.equal(f.submitted, 0);
  input.listeners.keydown({ key: "Enter", preventDefault() {} });
  assert.equal(f.submitted, 1);
});

test("late speech events cannot replace another exploration's draft", (t) => {
  const f = voiceFixture(t), input = f.element("#question-input");
  f.controller.toggleVoice();
  const recognition = f.instances[0];
  recognition.result("第一个问题");
  f.controller.stop({ abort: true });
  f.switchScope();
  input.value = "第二个问题的草稿";
  f.controller.reset();
  recognition.result("迟到的旧转写");
  recognition.onend();
  assert.equal(input.value, "第二个问题的草稿");
  assert.equal(f.stored.get("atlas-input-mode"), "text");
});

test("microphone denial stays visible and leaves text editable without auto retry", (t) => {
  const f = voiceFixture(t), input = f.element("#question-input");
  input.value = "已经写好的文字";
  f.controller.toggleVoice();
  f.instances[0].onerror({ error: "not-allowed" });
  f.instances[0].onend();
  assert.match(f.element("#composer-voice-status").textContent, /未获得麦克风权限/);
  assert.equal(input.value, "已经写好的文字");
  assert.equal(input.readOnly, false);
  assert.equal(f.send.disabled, false);
  assert.equal(f.instances.length, 1);
  assert.equal(f.submitted, 0);
});
