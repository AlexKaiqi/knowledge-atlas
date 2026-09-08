export function normalizeInputMode(value) {
  return value === "voice" ? "voice" : "text";
}

function composing(event, state) {
  return event.isComposing || event.keyCode === 229 || state.composing ||
    (state.now ?? Infinity) - (state.compositionEndedAt ?? -Infinity) < 250;
}

export function shouldSendOnEnter(event, state = {}) {
  return event.key === "Enter" && !event.shiftKey && !event.altKey &&
    !event.repeat && !composing(event, state);
}

export function isVoiceShortcut(event, state = {}) {
  return (event.code === "Space" || event.key === " ") &&
    Boolean(event.metaKey || event.ctrlKey) && Boolean(event.shiftKey) && !event.altKey &&
    !event.repeat && !composing(event, state);
}

export function appendTranscript(base, transcript, limit = 12000) {
  const spoken = transcript.trim();
  const combined = base + (base && spoken && !base.endsWith("\n") ? "\n" : "") + spoken;
  return { text: combined.slice(0, limit), truncated: combined.length > limit };
}

// Speech stays in the composer and in the current exploration's draft until submission.
export function createComposerInput({ getScope, getDisabled, getBusy, onDraft, beforeVoice }) {
  const input = document.querySelector("#question-input");
  const form = document.querySelector("#composer");
  const send = form.querySelector(".send-button");
  const voicePanel = document.querySelector("#composer-voice");
  const voiceMain = document.querySelector("#voice-main");
  const voiceLabel = document.querySelector("#voice-main-label");
  const voiceStatus = document.querySelector("#composer-voice-status");
  const textEntry = document.querySelector("#composer-text-entry");
  const inputLabel = document.querySelector("#question-label");
  const modeButtons = [...form.querySelectorAll("[data-input-mode]")];
  const microphoneButtons = [...document.querySelectorAll('[data-action="voice"]')];
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let mode = "text", phase = "idle", status = "", run = null;
  let isComposing = false, compositionEndedAt = -Infinity;
  try { mode = normalizeInputMode(localStorage.getItem("atlas-input-mode")); } catch {}

  const keyState = () => ({ composing: isComposing, compositionEndedAt, now: performance.now() });
  const isCurrent = (session) => {
    const scope = getScope();
    return session.scope.id === scope.id && session.scope.epoch === scope.epoch;
  };

  function refresh() {
    const blocked = getDisabled(), active = Boolean(run), busy = getBusy();
    form.dataset.inputMode = mode;
    form.dataset.voicePhase = !active && input.value.trim() ? "review" : phase;
    input.disabled = blocked;
    input.readOnly = active;
    input.placeholder = active ? "正在转写，停止后可以编辑…" : "把问题说出来，或者接着往下想…";
    send.disabled = blocked || busy || active || !input.value.trim();
    voicePanel.hidden = mode !== "voice";
    textEntry.hidden = mode === "voice" && !input.value && !active && phase !== "review";
    inputLabel.classList.toggle("sr-only", mode !== "voice");
    inputLabel.textContent = mode === "voice" ? "识别文字 · 检查后发送" : "你想探索什么";
    voiceMain.disabled = blocked || busy || phase === "stopping" || !Recognition;
    voiceMain.dataset.recording = String(active);
    voiceMain.setAttribute("aria-pressed", String(active));
    voiceLabel.textContent = !Recognition ? "此浏览器暂不支持语音" : phase === "stopping"
      ? "正在整理文字…" : active ? "停止并编辑" : input.value.trim() ? "继续说话" : "点击开始说话";
    voiceStatus.textContent = status || (Recognition
      ? "说完后停止转写，检查文字，再发送。"
      : "可切回文字，或使用手机键盘上的听写输入。");
    modeButtons.forEach((button) => {
      const selected = button.dataset.inputMode === mode;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    microphoneButtons.forEach((button) => {
      button.disabled = blocked || busy;
      button.setAttribute("aria-label", active ? "停止语音并编辑" : "语音输入");
    });
  }

  function keepTranscript(session) {
    if (!isCurrent(session)) return false;
    const result = appendTranscript(session.base, session.transcript, input.maxLength);
    input.value = result.text;
    onDraft();
    return result.truncated;
  }

  function finish(session, error = "") {
    if (run !== session) return;
    clearTimeout(session.timer);
    keepTranscript(session);
    run = null;
    phase = input.value.trim() ? "review" : "idle";
    status = error || (session.transcript.trim()
      ? "转写已停止。可以修改文字，确认后发送。"
      : "没有识别到文字。可以再试一次，或切回文字输入。");
    refresh();
    if (session.focusOnEnd && isCurrent(session)) focusText();
  }

  function stop({ abort = false } = {}) {
    if (!run) return;
    const session = run;
    if (abort) {
      session.focusOnEnd = false;
      finish(session);
      try { session.recognition.abort(); } catch {}
    } else {
      if (phase === "stopping") return;
      phase = "stopping";
      status = "正在停止转写，已识别的文字会保留。";
      session.focusOnEnd = true;
      refresh();
      session.timer = setTimeout(() => {
        finish(session);
        try { session.recognition.abort(); } catch {}
      }, 2000);
      try { session.recognition.stop(); } catch { finish(session); }
    }
  }

  function setMode(value, { remember = true, focus = false } = {}) {
    const next = normalizeInputMode(value);
    if (next !== "voice") stop({ abort: true });
    mode = next;
    if (remember) {
      try { localStorage.setItem("atlas-input-mode", mode); } catch {}
    }
    refresh();
    if (focus) focusInput();
  }

  function toggleVoice() {
    if (run) { stop(); return; }
    if (getDisabled() || getBusy() || beforeVoice() === false) return;
    setMode("voice", { remember: false });
    if (!Recognition) { voiceMain.focus(); return; }
    const recognition = new Recognition();
    const session = { recognition, scope: getScope(), base: input.value, transcript: "", timer: null };
    run = session;
    phase = "listening";
    status = "正在打开麦克风…";
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => {
      if (run !== session) return;
      status = "正在听，文字会显示在下方。说完后点「停止并编辑」。";
      refresh();
    };
    recognition.onresult = (event) => {
      if (run !== session || !isCurrent(session)) return;
      session.transcript = Array.from(event.results).map((result) => result[0].transcript).join("");
      if (keepTranscript(session)) {
        finish(session, "已达到输入长度上限。请检查或删减文字后发送。");
        try { recognition.abort(); } catch {}
      } else refresh();
    };
    recognition.onerror = (event) => {
      if (run !== session) return;
      const errors = {
        "not-allowed": "未获得麦克风权限。可在浏览器设置中允许，或切回文字输入。",
        "service-not-allowed": "浏览器未允许语音识别服务，可切回文字输入。",
        "audio-capture": "没有找到可用的麦克风，可切回文字输入。",
        network: "语音服务连接中断。已识别的文字保留，可编辑后发送。",
        "no-speech": "没有听到声音。可以重试，或切回文字输入。",
        aborted: "语音已停止，已识别的文字保留。",
      };
      finish(session, errors[event.error] || "语音识别中断。已识别的文字保留，可编辑后发送。");
      try { recognition.abort(); } catch {}
    };
    recognition.onend = () => finish(session);
    refresh();
    try { recognition.start(); }
    catch { finish(session, "无法开启语音。可以重试，或切回文字输入。"); }
  }

  function focusText() {
    phase = "review";
    refresh();
    input.focus();
  }

  function focusInput() {
    refresh();
    if (mode === "voice" && !input.value.trim()) voiceMain.focus();
    else input.focus();
  }

  input.addEventListener("input", () => { onDraft(); refresh(); });
  input.addEventListener("compositionstart", () => { isComposing = true; });
  input.addEventListener("compositionend", () => {
    isComposing = false;
    compositionEndedAt = performance.now();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.altKey) return;
    if (event.isComposing || event.keyCode === 229 || isComposing) return;
    event.preventDefault();
    if (shouldSendOnEnter(event, keyState()) && !send.disabled) form.requestSubmit();
  });
  modeButtons.forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.inputMode, { focus: true }));
  });
  voiceMain.addEventListener("click", toggleVoice);
  refresh();
  return {
    refresh, setMode, toggleVoice, stop, focusText, focus: focusInput,
    handleShortcut(event) {
      if (!isVoiceShortcut(event, keyState())) return false;
      event.preventDefault();
      toggleVoice();
      return true;
    },
    reset() {
      stop({ abort: true });
      phase = "idle";
      status = "";
      isComposing = false;
      compositionEndedAt = -Infinity;
      refresh();
    },
  };
}
