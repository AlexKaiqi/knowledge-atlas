import { createEnvironmentUI } from "./workspace-environments.js";
import { createBrowserPanel } from "./browser-panel.js";
import { createAgentTimeline, newerJob, activeJob } from "./agent-live.js";
import { parallelModel, causalModel } from "../runtime/core/learning-models.js";
import { createAgentHandoff } from "./agent-handoff.js";
import { markdown } from "./markdown.js";
import { createComposerInput } from "./composer-input.js";
import { agentPresentation, replyRequestTarget, visibleWorkspaceJobs } from "./agent-status.js";
import { readWorkspaceRoute, workspaceUrl, sceneLabels, knowledgeContext, contextualQuestion } from "./workspace-navigation.js";
import { spaceScene, spaceCards, knowledgeScene, knowledgeCards, documentCards, practiceScene, practiceModels } from "./workspace-scenes.js";
import { publicApi, proposalHistory } from "./knowledge-proposals.js";
import { renderPublicKnowledge } from "./public-knowledge.js";
const $ = (s, r = document) => r.querySelector(s),
  $$ = (s, r = document) => [...r.querySelectorAll(s)];
const config = JSON.parse($("#workspace-data").textContent);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const appBase = new URL(config.root, location.href);
// Resolve entry-page links before pushState changes the relative URL base.
$$('a[href]').filter(a => !a.getAttribute('href').startsWith('#')).forEach(a => { a.href = a.href; });
config.root = appBase.pathname;
const routeDefaults = { ...config, entryPath: location.pathname };
const state = {
  ...readWorkspaceRoute(location.href, routeDefaults),
  space: null,
  data: null,
  selected: null,
  context: null,
  session: null,
  view: "mine",
  messagesSignature: "",
  panelSignature: "",
  polling: false,
  loading: false,
  sending: false,
  epoch: 0,
};
const initialPanel = $("#panel-content").innerHTML;
const timeline = createAgentTimeline({ container: $("#jobs"), scroll: $("#conversation-scroll"), summary: $("#panel-progress") });
const browserPanel = createBrowserPanel({ root: $("#browser-panel"), api, notify });
let jobStream = null, streamScope = null, loadSequence = 0;
function closeJobStream() { jobStream?.close(); jobStream = null; streamScope = null; }
function syncBrowserPanel() {
  return browserPanel.sync({ id: state.id, available: !!state.session?.capabilities.browser,
    activityKey: (state.data?.jobs || []).filter(j=>j.runner==="codex").flatMap(j=>(j.progress?.items||[]).filter(i=>i.type==="tool" && i.status==="completed" && /browser/i.test(i.text)).map(i=>i.id)).join(":"),
    canUse: !!state.space?.role, shown: state.scene === "conversation" && $(".results").dataset.panel === "browser" && (!window.matchMedia("(max-width: 850px)").matches || $(".work-columns").dataset.view === "results") });
}
function panelView(view) {
  $(".results").dataset.panel = view;
  $$(".workbench-tabs button").forEach(button => {
    const active = button.dataset.action === "panel-" + view;
    button.classList.toggle("selected", active); button.setAttribute("aria-pressed", String(active));
  });
  syncBrowserPanel();
}
function syncJobStream() {
  const id = state.id, epoch = state.epoch;
  if (!id || state.scene !== "conversation" || !state.data?.capabilities.agentStreaming || !state.data.jobs.some(j => j.runner === "codex" && activeJob(j))) {
    closeJobStream(); return;
  }
  if (jobStream && streamScope === `${id}:${epoch}`) return;
  closeJobStream();
  const source = new EventSource(`/api/workspace/spaces/${id}/events`);
  jobStream = source; streamScope = `${id}:${epoch}`;
  const current = () => jobStream === source && state.id === id && state.epoch === epoch && state.scene === "conversation";
  source.addEventListener("jobs", event => {
    if (!current() || !state.data) return;
    const data = JSON.parse(event.data);
    if (data.space !== id) return;
    const jobs = new Map(state.data.jobs.map(j => [j.id, j]));
    let completed = false;
    for (const j of data.jobs) {
      const old = jobs.get(j.id), next = newerJob(old, j);
      if (next === j && old?.status !== j.status && !activeJob(j)) completed = true;
      jobs.set(j.id, next);
    }
    state.data.jobs = [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
    renderJobs(state.data.jobs); renderAgentStatus(state.data.capabilities, state.data.jobs);
    $("#connection-note").textContent = "实时连接 · 过程与探索持续保存";
    syncBrowserPanel();
    if (completed) loadSpace(id, { quiet: true }).catch(() => {});
  });
  source.addEventListener("settled", () => { if (current()) closeJobStream(); });
  source.addEventListener("denied", () => {
    if (!current()) return;
    closeJobStream(); state.epoch++; loadSequence++;
    state.data = null; state.space = null; state.selected = null; state.context = null;
    state.messagesSignature = ""; state.panelSignature = "";
    $("#messages").replaceChildren(); $("#jobs").replaceChildren(); timeline.update([]);
    $("#artifact-tabs").replaceChildren(); $("#panel-content").innerHTML = initialPanel;
    $("#space-title").textContent = "探索的访问范围已改变";
    contextPill(); browserPanel.sync({id:null,available:false,canUse:false,shown:false});
    close(); composerInput.refresh(); notify("探索的访问范围已改变。");
  });
  source.onerror = () => { if (current()) $("#connection-note").textContent = "实时连接暂时中断，正在接续；已收到的内容仍保留。"; };
}
const composerWrap = $(".composer-wrap"), conversationHost = $(".conversation");
// The same input/voice controller serves a new question and an existing discussion.
// Keep their unsent drafts separate even when mine retains a return-to-space URL.
let draftId = state.scene === "mine" ? "mine" : state.id;
let modalEpoch = 0;
let notificationTimer,
  earliest = null,
  speaking = false;
const requestKeys = new Map();
let sessionPromise;
function sessionReady() {
  if (!sessionPromise)
    sessionPromise = api("/session")
      .then((session) => {
        state.session = session;
        return session;
      })
      .catch((error) => {
        sessionPromise = null;
        throw error;
      });
  return sessionPromise;
}
function saveDraft(id = draftId) {
  try {
    sessionStorage.setItem(
      "atlas-input:" + (id || "new"),
      $("#question-input").value,
    );
    sessionStorage.setItem("atlas-context:" + (id || "new"), JSON.stringify(state.context));
  } catch {}
}
function restoreDraft(id = draftId) {
  draftId = id;
  try {
    if (id === 'mine' && sessionStorage.getItem('atlas-input:mine') === null) {
      const legacyDraft = sessionStorage.getItem('atlas-input:new');
      if (legacyDraft !== null) {
        sessionStorage.setItem('atlas-input:mine', legacyDraft);
        sessionStorage.setItem('atlas-context:mine', sessionStorage.getItem('atlas-context:new') || 'null');
      }
    }
    $("#question-input").value =
      sessionStorage.getItem("atlas-input:" + (id || "new")) ||
      (!id ? config.initialQuestion || "" : "");
    state.context = JSON.parse(sessionStorage.getItem("atlas-context:" + (id || "new")) || "null");
    contextPill();
  } catch {}
}
const composerInput = createComposerInput({
  getScope: () => ({ id: draftId, epoch: state.epoch }),
  getDisabled: () => state.scene === "mine" ? false : state.scene !== "conversation" || state.loading || Boolean(state.id && (!state.space || !state.space.role)),
  getBusy: () => state.sending,
  onDraft: () => saveDraft(),
  beforeVoice: () => {
    if ($("#dialog").open) {
      notify("请先关闭当前面板，再开始语音输入。");
      return false;
    }
    if (speaking) {
      speechSynthesis.cancel();
      speaking = false;
    }
    setView("conversation");
  },
});

async function api(route, body) {
  if (route !== "/session" && !state.session) await sessionReady();
  let response;
  try {
    response = await fetch(`/api/workspace${route}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "content-type": "application/json" } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error("网络未连接。输入还在，请恢复连接后重试。");
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("探索服务尚未启动，当前页面无法保存。");
  }
  if (!response.ok) {
    const error = new Error(data.error || "暂时无法完成，请重试。");
    error.status = response.status;
    throw error;
  }
  return data;
}
async function mutate(route, body) {
  const signature = route + JSON.stringify(body);
  let requestId = requestKeys.get(signature);
  if (!requestId) {
    requestId = crypto.randomUUID();
    requestKeys.set(signature, requestId);
  }
  const result = await api(route, { ...body, requestId });
  requestKeys.delete(signature);
  return result;
}
function notify(message) {
  $("#notification").textContent = message;
  $("#notification").hidden = false;
  clearTimeout(notificationTimer);
  notificationTimer = setTimeout(
    () => ($("#notification").hidden = true),
    5000,
  );
}
function safe(action) {
  return async (event) => {
    try {
      await action(event);
    } catch (error) {
      notify(error.message);
    }
  };
}
function date(time) {
  return new Date(time).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function download(filename, data, type = "application/json") {
  const href = URL.createObjectURL(
    new Blob(
      [typeof data === "string" ? data : JSON.stringify(data, null, 2)],
      { type },
    ),
  );
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  (document.querySelector("dialog[open]") || document.body).append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
function setView(view) {
  $(".work-columns").dataset.view = view;
  $$("[data-view]")
    .filter((x) => x.tagName === "BUTTON")
    .forEach((b) => {
      b.classList.toggle("selected", b.dataset.view === view);
      b.setAttribute("aria-pressed", String(b.dataset.view === view));
    });
  syncBrowserPanel();
}
const mobileLayout = window.matchMedia("(max-width: 850px)");
function setMenu(open, { restoreFocus = false } = {}) {
  const rail = $("#rail"), toggle = $("#menu-toggle");
  rail.classList.toggle("open", open);
  rail.inert = mobileLayout.matches && !open;
  toggle.setAttribute("aria-expanded", String(open));
  if (open && mobileLayout.matches) $(".rail-close").focus();
  else if (restoreFocus && mobileLayout.matches) toggle.focus();
}
mobileLayout.addEventListener("change", () => setMenu(false));
setMenu(false);
function modal(html) {
  modalEpoch++;
  composerInput.stop({ abort: true });
  $("#dialog-body").innerHTML = html;
  if (!$("#dialog").open) $("#dialog").showModal();
}
function offerRebase(form, latest, accept) {
  let box = $("[data-conflict]", form);
  if (!box) {
    box = document.createElement("div");
    box.dataset.conflict = "";
    form.append(box);
  }
  box.innerHTML = `<div class="review-block"><strong>正文已有新版本，你的输入仍然保留。</strong><details open><summary>比较最新正文</summary><pre class="artifact-meta">${esc(latest)}</pre></details><button type="button" class="secondary">我已比较，以最新版本为基础继续修改</button></div>`;
  $("button", box).onclick = () => {
    accept();
    box.innerHTML =
      '<p class="status-line">已更新基础版本。请合并需要保留的内容，再保存。</p>';
  };
  box.scrollIntoView({ block: "nearest" });
}
function close() {
  modalEpoch++;
  $("#dialog").close();
}
function bindForm(selector, handler) {
  $(selector).addEventListener(
    "submit",
    safe(async (e) => {
      e.preventDefault();
      const form = e.currentTarget,
        button = $("[type=submit]", form);
      if (button.disabled) return;
      button.disabled = true;
      if (form.id === "composer") {
        state.sending = true;
        composerInput.refresh();
      }
      try {
        await handler(Object.fromEntries(new FormData(form)), form);
      } finally {
        if (form.id === "composer") {
          state.sending = false;
          composerInput.refresh();
        } else button.disabled = false;
      }
    }),
  );
}
let listEpoch = 0;
async function listSpaces() {
  const epoch = ++listEpoch;
  const result = await api(
    "/spaces",
  );
  if (epoch !== listEpoch) return;
  updateSceneChrome();
  $("#recent-label").textContent = "最近探索";
  $("#spaces").innerHTML = result.spaces.length
    ? result.spaces
        .map(
          (s) =>
            `<button data-space="${s.id}" class="${s.id === state.id ? "selected" : ""}" title="${esc(s.title)}">${esc(s.title)}</button>`,
        )
        .join("")
    : `<p class="muted">第一段探索，从你的问题开始。</p>`;
}
async function loadSpace(id, { quiet = false } = {}) {
  const epoch = state.epoch;
  const sequence = ++loadSequence;
  const data = await api(`/spaces/${id}`);
  if (id !== state.id || epoch !== state.epoch || sequence !== loadSequence) return;
  if (state.data?.space.id === id) {
    const combined = new Map(state.data.messages.map((m) => [m.id, m]));
    for (const m of data.messages) combined.set(m.id, m);
    data.messages = [...combined.values()].sort((a, b) => a.cursor - b.cursor);
    data.hasEarlier = state.data.hasEarlier;
    data.jobs = data.jobs.map(job => newerJob(state.data.jobs.find(j => j.id === job.id), job));
  }
  state.data = data;
  state.space = data.space;
  state.loading = false;
  $("#welcome").hidden = true;
  $("#space-title").textContent = data.space.title;
  $("#privacy-badge").textContent =
    data.space.visibility === "shared" ? "本站共享" : "仅自己";
  $("#join-box").hidden = !!data.space.role;
  composerInput.refresh();
  renderAgentStatus(data.capabilities, data.jobs);
  const sig = JSON.stringify([data.messages, data.capabilities.agent, data.space.role,
    data.jobs.filter((job) => job.runner === "codex").map((job) => [job.id, job.messageId, job.status])]);
  if (sig !== state.messagesSignature) {
    const scroll = $("#conversation-scroll"),
      nearBottom =
        scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 130;
    state.messagesSignature = sig;
    renderMessages(data.messages);
    earliest = data.messages[0]?.cursor;
    $("#load-earlier").hidden = !data.hasEarlier;
    if (!quiet || nearBottom) scroll.scrollTop = scroll.scrollHeight;
  }
  renderJobs(data.jobs);
  $("#mobile-count").textContent = data.artifacts.length;
  $("#artifact-tabs").innerHTML = data.artifacts
    .map(
      (a) =>
        `<button data-artifact="${a.id}" class="${a.id === state.selected ? "selected" : ""}">${esc(a.title)} <small>v${a.version}</small></button>`,
    )
    .join("");
  if (!state.selected && data.artifacts.length)
    state.selected = data.artifacts[0].id;
  const selected = data.artifacts.find((a) => a.id === state.selected);
  if (selected) {
    const sign = selected.id + ":" + selected.version;
    if (state.panelSignature !== sign) {
      state.panelSignature = sign;
      renderArtifact(selected);
    }
  } else if (!state.selected) {
    $("#panel-content").innerHTML = initialPanel;
  }
  $("#connection-note").textContent = data.capabilities.agent
    ? "探索已保存 · 退出后可继续"
    : "探索自动保存 · 可导出资料，交给自己的 Agent 继续";
  syncJobStream(); syncBrowserPanel();
}
function renderAgentStatus(capabilities = state.session?.capabilities, jobs = []) {
  const presentation = agentPresentation(capabilities, state.scene === "mine" ? [] : jobs);
  $("#agent-status").dataset.state = presentation.state;
  $("#agent-status").textContent = presentation.text;
}
function renderMessages(messages) {
  const replyTarget = state.space?.role && state.data?.capabilities.agent
    ? replyRequestTarget(messages, state.data.jobs) : null;
  $("#messages").innerHTML = messages
    .map((m) => {
      const assistant = m.kind === "assistant";
      return `<article class="message ${m.mine ? "mine" : ""} ${assistant ? "assistant" : ""}" id="message-${m.id}"><div class="message-meta"><b>${esc(m.name)}${assistant ? " · AI" : m.mine ? " · 我" : ""}</b><span>${date(m.createdAt)}</span></div><div class="message-body${assistant ? " markdown" : ""}">${assistant ? markdown(m.body) : esc(m.body)}</div><div class="message-tools">${replyTarget?.id === m.id ? `<button data-assistant-message="${m.id}">请 AI 回答</button>` : ""}<button data-note-message="${m.id}">整理为笔记</button><button data-speak-message="${m.id}">朗读</button></div></article>`;
    })
    .join("");
}
const statuses = {
  queued: "等待执行",
  running: "正在运行",
  succeeded: "已完成",
  failed: "执行未完成",
  cancelled: "已停止",
  waiting_provider: "待交给自己的 Agent",
};
function renderJobs(jobs) {
  const html = visibleWorkspaceJobs(jobs).filter(j => j.runner !== "codex")
    .map(
      (j) =>
        `<div class="job-card ${j.status}"><div><i class="job-dot"></i><b>${esc(j.runner === "codex" ? (state.data?.capabilities.agentName || "Codex") : j.runner === "agent" ? "Agent 待办" : j.runner === "docker" ? "Python 实验" : j.runner === "parallel" ? "并行协作模型" : "相关与因果模型")}</b><span>· ${statuses[j.status] || j.status}</span></div>${j.status === "waiting_provider" ? "<p>这是之前保存的待办。可通过「交给自己的 Agent」继续，完成后移出待办。</p>" : ""}${j.prompt ? `<p>${esc(j.prompt)}</p>` : ""}${j.error ? `<p>${esc(j.error)}</p>` : ""}${j.artifact ? `<button data-artifact="${j.artifact}">查看成果 →</button>` : ""}${["queued", "running", "waiting_provider"].includes(j.status) ? `<button data-job="${j.id}" data-operation="cancel">${j.status === "waiting_provider" ? "移出待办" : "停止任务"}</button>` : ""}${["failed", "cancelled"].includes(j.status) ? `<button data-job="${j.id}" data-operation="retry">按原条件重试</button>` : ""}<small class="muted"> ${date(j.updatedAt)}</small></div>`,
    )
    .join("");
  if ($("#jobs").innerHTML !== html) $("#jobs").innerHTML = html;
  timeline.update(jobs, state.data?.messages || []);
}
async function selectSpace(id, { push = true, reveal = true } = {}) {
  closeJobStream();
  composerInput.stop({ abort: true });
  saveDraft();
  state.epoch++;
  state.loading = true;
  state.id = id;
  state.space = null;
  state.data = null;
  state.selected = null;
  state.context = null;
  state.messagesSignature = "";
  state.panelSignature = "";
  $("#artifact-context").hidden = true;
  if (reveal) setView("conversation");
  if (reveal) { if (["mine", "shared", "practice"].includes(state.scene)) state.returnScene = state.scene; state.scene = "conversation"; state.knowledge = ""; state.document = ""; sceneEpoch++; }
  updateSceneChrome();
  if (push) updateRoute();
  $("#space-title").textContent = "正在载入探索…";
  $("#welcome").hidden = true;
  $("#messages").innerHTML = "";
  $("#jobs").innerHTML = "";
  $("#artifact-tabs").innerHTML = "";
  $("#panel-content").innerHTML = "<p class=muted>正在载入成果…</p>";
  restoreDraft(state.scene === "mine" ? "mine" : id);
  composerInput.reset();
  renderAgentStatus();
  setMenu(false, { restoreFocus: true });
  await loadSpace(id);
  await listSpaces();
}
function newSpace({ push = true } = {}) {
  closeJobStream();
  composerInput.stop({ abort: true });
  saveDraft();
  state.epoch++;
  state.loading = false;
  state.id = null;
  state.space = null;
  state.data = null;
  state.selected = null;
  state.context = null;
  state.messagesSignature = "";
  state.panelSignature = "";
  state.scene = "conversation"; state.knowledge = ""; state.document = ""; state.returnScene = null; sceneEpoch++;
  updateSceneChrome();
  if (push) updateRoute();
  restoreDraft(null);
  $("#welcome").hidden = false;
  $("#messages").innerHTML = "";
  $("#jobs").innerHTML = "";
  $("#artifact-tabs").innerHTML = "";
  $("#panel-content").innerHTML = initialPanel;
  $("#space-title").textContent = "新的好奇";
  $$("#spaces button").forEach(button => button.classList.remove("selected"));
  $("#privacy-badge").textContent = "仅自己";
  $("#mobile-count").textContent = "0";
  $("#join-box").hidden = true;
  $("#load-earlier").hidden = true;
  $("#artifact-context").hidden = true;
  composerInput.reset();
  renderAgentStatus();
  setMenu(false, { restoreFocus: true });
  setView("conversation");
  contextPill();
  composerInput.focus();
}
async function ensureSpace() {
  if (state.loading || (state.id && !state.space))
    throw new Error("探索尚未载入，连接恢复后再试。");
  if (state.id) return state.id;
  const epoch = state.epoch;
  const data = await mutate("/spaces", {
    body: $("#question-input").value.trim() || "一段新的探索",
    askAgent: false,
  });
  if (state.epoch !== epoch) {
    await listSpaces();
    throw new Error("已切换探索。新探索已保存，请从最近探索打开后继续。");
  }
  await selectSpace(data.id);
  return data.id;
}
bindForm("#composer", async () => {
  if (state.loading && state.scene !== "mine") throw new Error("正在载入，请稍候。");
  const entryScene = state.scene, originDraft = draftId, navigation = sceneEpoch;
  const input = $("#question-input"),
    raw = input.value,
    body = raw.trim(),
    scope = entryScene === "mine" ? null : state.id,
    epoch = state.epoch;
  if (!body) return;
  const context = state.context;
  if (context?.sourceType === "document") {
    const source = await api(`/knowledge/${context.id}`);
    const destination = scope ? await api(`/spaces/${scope}`) : null;
    if (source.document.visibility !== "shared" && destination?.space.visibility === "shared")
      throw new Error("这份知识目前是私人草稿。请移除引用，或在自己的私人探索中继续。");
  }
  const text = context
      ? contextualQuestion(body, context)
      : body;
  if (!scope) {
    const result = await mutate("/spaces", { body: text, title: body.slice(0, 80), visibility: "private" });
    if (state.epoch === epoch && draftId === originDraft && (entryScene !== "mine" || sceneEpoch === navigation)) {
      // Typing may continue while the first question is being created. Move that
      // next draft to the assigned space before switching, rather than losing it.
      input.value = input.value === raw ? "" : input.value;
      if (!input.value) state.context = null;
      saveDraft(result.id);
      input.value = "";
      state.context = null;
      saveDraft();
      await selectSpace(result.id, { reveal: state.scene === "conversation" || state.scene === "mine" });
    } else notify("问题已保存，可以从最近探索继续。");
  } else {
    await mutate(`/spaces/${scope}/messages`, { body: text });
    if (state.epoch === epoch && draftId === originDraft) {
      if (input.value === raw) {
        input.value = "";
        saveDraft();
      }
      await loadSpace(scope);
      if (state.epoch === epoch && state.id === scope && state.scene === "conversation") setView("conversation");
    }
  }
  await listSpaces();
});
$("#load-earlier").onclick = safe(async () => {
  const id = state.id,
    epoch = state.epoch;
  const result = await api(`/spaces/${id}?before=${earliest}`);
  if (state.id !== id || state.epoch !== epoch || !state.data) return;
  state.data.messages = [
    ...new Map(
      [...result.messages, ...state.data.messages].map((m) => [m.id, m]),
    ).values(),
  ];
  state.data.hasEarlier = result.hasEarlier;
  earliest = result.messages[0]?.cursor;
  const scroll = $("#conversation-scroll"), height = scroll.scrollHeight, top = scroll.scrollTop;
  renderMessages(state.data.messages); renderJobs(state.data.jobs);
  scroll.scrollTop = top + scroll.scrollHeight - height;
  $("#load-earlier").hidden = !result.hasEarlier;
});
function renderArtifact(a) {
  $("#artifact-tabs")
    .querySelectorAll("button")
    .forEach((b) =>
      b.classList.toggle("selected", b.dataset.artifact === a.id),
    );
  let body =
    a.kind === "model"
      ? modelView(a)
      : a.kind === "html"
        ? '<iframe class="preview-frame" sandbox="allow-scripts" referrerpolicy="no-referrer" title="隔离的交互成果"></iframe>'
        : `<article class="markdown">${markdown(a.body)}</article>`;
  if (a.metadata.origin === "environment") body += `<div class="environment-files">${a.metadata.files.map(f => `<details><summary>${esc(f.path)}</summary><pre><code>${esc(f.content)}</code></pre></details>`).join('')}</div><div class="environment-actions"><button class="primary" data-action="handoff">交给自己的 Agent 构建</button><button class="secondary" data-action="open-environment">查看与共建源环境</button></div>`;
  $("#panel-content").innerHTML =
    `<div class="artifact-heading"><div><h2>${esc(a.title)}</h2><small>v${a.version} · ${date(a.createdAt)} · ${a.metadata.origin === "execution" ? "实际运行结果" : esc(a.name || "参与者")}</small></div><button class="icon-button" data-action="speak-artifact" aria-label="朗读成果">▷</button></div>${body}<div class="artifact-meta">${esc(a.metadata.boundary || "可继续补充和修订；保存新版本不会覆盖旧内容。")}</div><div class="artifact-actions"><button data-action="focus-artifact">围绕它继续说</button>${a.metadata.origin !== "environment" && ["markdown", "html"].includes(a.kind) ? '<button data-action="edit-artifact">修改成果</button>' : ""}<button data-action="history">版本与运行条件</button>${a.kind === "markdown" ? '<button data-action="distill">沉淀为知识草稿</button>' : '<button data-action="note-result">整理发现</button>'}<button data-action="download-artifact">下载</button></div>`;
  if (a.kind === "html") {
    const frame = $("iframe", $("#panel-content"));
    frame.srcdoc = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'"><meta name="viewport" content="width=device-width,initial-scale=1">${a.body}`;
  }
  if (a.kind === "model") bindModel(a);
}
function modelView(a) {
  const input = a.metadata.input,
    result = JSON.parse(a.body);
  if (a.metadata.runner === "parallel")
    return `<form class="model-form" id="model-form"><label>可并行的工作比例 <output id="p-label">${Math.round(input.p * 100)}%</output><input name="p" aria-label="可并行的工作比例" type="range" min="0" max="100" value="${input.p * 100}"></label><label>一起执行的数量 <output id="s-label">${input.s}</output><input name="s" aria-label="一起执行的数量" type="range" min="1" max="64" value="${Math.min(input.s, 64)}"></label><div class="model-metric"><strong id="metric">${result.speedup.toFixed(2)}×</strong><span>模型中的速度提升 · 下方调整为预览</span></div><button class="primary" type="submit">运行并保存这组条件</button></form>`;
  return `<form class="model-form" id="model-form"><label>下雨的比例 <output id="rain-label">${Math.round(input.rain * 100)}%</output><input name="rain" aria-label="下雨的比例" type="range" min="5" max="95" value="${input.rain * 100}"></label><label>比较方式<select name="mode"><option value="observe" ${input.mode === "observe" ? "selected" : ""}>观察带伞和没带伞的人</option><option value="intervene" ${input.mode === "intervene" ? "selected" : ""}>在相同天气比例下比较</option></select></label><div class="model-bars" id="model-bars">${causalBars(result)}</div><button class="primary" type="submit">运行并保存这组条件</button></form>`;
}
function causalBars(r) {
  return `<p class="muted">模型里的淋湿比例 · 调整参数可预览</p>${[
    ["带伞", r.umbrella],
    ["不带伞", r.without],
  ]
    .map(
      ([label, v]) =>
        `<div class="model-bar"><span>${label}</span><i style="width:${v * 100}%"></i><b>${(v * 100).toFixed(1)}%</b></div>`,
    )
    .join("")}`;
}
function bindModel(a) {
  const form = $("#model-form");
  const read = () => {
    const f = Object.fromEntries(new FormData(form));
    return a.metadata.runner === "parallel"
      ? { p: Number(f.p) / 100, s: Number(f.s) }
      : { rain: Number(f.rain) / 100, mode: f.mode };
  };
  form.oninput = () => {
    const p = read();
    if (a.metadata.runner === "parallel") {
      $("#p-label").textContent = p.p * 100 + "%";
      $("#s-label").textContent = p.s;
      $("#metric").textContent =
        parallelModel(p.p, p.s).speedup.toFixed(2) + "×";
    } else {
      $("#rain-label").textContent = p.rain * 100 + "%";
      $("#model-bars").innerHTML = causalBars(causalModel(p.rain, p.mode));
    }
  };
  bindForm("#model-form", async () => {
    await runModel(a.metadata.runner, read());
  });
}
async function runModel(runner, input) {
  const id = await ensureSpace();
  await mutate(`/spaces/${id}/jobs`, { runner, input });
  state.selected = null;
  state.panelSignature = "";
  await loadSpace(id);
  await listSpaces();
  setView("results");
}
function toolsModal() {
  modal(
    `<h2>让这个问题，往前走一步。</h2><p>选择一种表达方式。成果会留在当前探索中，也可以随时再修改。</p><div class="tool-grid"><button data-tool="note"><b>一份自由笔记</b><small>解释、来源、还没想通的地方</small></button><button data-tool="html"><b>一个交互页面</b><small>放入 HTML，成为可操作的面板</small></button><button data-tool="parallel"><b>并行协作实验</b><small>增加人手，会带来多少改变？</small></button><button data-tool="causal"><b>相关与因果实验</b><small>改变比较方式，观察结论</small></button><button data-tool="docker"><b>Python 实验</b><small>${state.session?.capabilities.docker ? "在隔离环境里执行并展示结果" : "当前服务没有可用的 Python 执行器"}</small></button><button data-tool="agent"><b>交给自己的 Agent</b><small>选择材料，继续查证、解释或实践</small></button><button data-action="import"><b>带回 Agent 成果</b><small>选择笔记或交互页面，检查后保存</small></button></div>`,
  );
}
function noteModal({
  kind = "markdown",
  body = "",
  title = "",
  sourceMessage = null,
  previous = null,
  importing = false,
} = {}) {
  let originId = state.id, originEpoch = state.epoch;
  modal(
    `<h2>${previous ? "继续完善成果" : importing ? "带回 Agent 成果" : kind === "html" ? "创建一个交互面板" : "记下值得留下的想法"}</h2><p>${kind === "html" ? "内容会在隔离面板中展示，支持内联样式与脚本。外部资源与请求受限，页面无法直接访问主站凭据。" : "正文可以自由写。一个还没讲完的解释，也可以先保存。"}</p><form class="form-stack" id="artifact-form"><label>选择成果文件<input id="artifact-file" type="file" accept=".md,.markdown,.txt,.html,.htm"></label><p class="muted" id="artifact-file-status">支持 Markdown 或自包含 HTML。文件会先填入下方，检查后再保存。</p><label>名称<input name="title" value="${esc(title)}" required maxlength="160"></label><label><span id="artifact-body-label">${kind === "html" ? "HTML 内容" : "正文 · 支持 Markdown"}</span><textarea name="body" rows="12" maxlength="24000" required placeholder="${kind === "html" ? "粘贴或编写一个可操作的 HTML 页面" : "你在解释什么？有哪些发现或还没想通的地方？"}">${esc(body)}</textarea></label>${previous ? '<label>这次修改了什么<input name="reason" required maxlength="2000"></label>' : ""}<button class="primary" type="submit">${previous ? "保存新版本" : "保存到工作面板"}</button></form>`,
  );
  const artifactForm = $("#artifact-form");
  $("#artifact-file").onchange = safe(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/\.(md|markdown|txt|html|htm)$/i.test(file.name)) throw new Error("请选择 Markdown 或 HTML 文件。");
    if (file.size > 40000) throw new Error("文件超过当前成果大小限制，请拆成较小的成果。");
    const text = await file.text();
    if (!artifactForm.isConnected) return;
    if (text.length > 24000) throw new Error("文件超过 24000 字符，请拆成较小的成果。");
    const nextKind = /\.html?$/i.test(file.name) ? "html" : "markdown";
    if (previous && nextKind !== kind) throw new Error("修订时请选择相同类型的文件；也可以另建一个成果。");
    kind = nextKind;
    artifactForm.elements.body.value = text;
    if (!artifactForm.elements.title.value) artifactForm.elements.title.value = file.name.replace(/\.[^.]+$/, "").slice(0, 160);
    $("#artifact-body-label").textContent = kind === "html" ? "HTML 内容" : "正文 · 支持 Markdown";
    $("#artifact-file-status").textContent = `已读入 ${file.name}，请检查后保存。${kind === "html" ? "页面在隔离面板运行，外部资源与网络请求受限。" : ""}`;
  });
  bindForm("#artifact-form", async (p, form) => {
    if (state.id !== originId || state.epoch !== originEpoch)
      throw new Error("已切换探索，尚未保存这份成果。请复制输入，在目标探索重新打开成果表单。");
    const id = await ensureSpace();
    const saveEpoch = state.epoch;
    originId = id;
    originEpoch = saveEpoch;
    let result;
    try {
      result = await mutate(`/spaces/${id}/artifacts`, {
        ...p,
        kind,
        sourceMessage,
        ...(previous
          ? { artifactId: previous.id, baseVersion: previous.version }
          : {}),
      });
    } catch (error) {
      if (error.status === 409 && previous && state.epoch === saveEpoch && form.isConnected) {
        const current = await api(`/spaces/${id}/artifacts/${previous.id}`);
        offerRebase(form, current.versions[0].body, () => {
          previous.version = current.versions[0].version;
        });
      }
      throw error;
    }
    if (state.epoch !== saveEpoch || state.id !== id || !form.isConnected) {
      notify("成果已保存在原探索中。");
      return;
    }
    state.selected = result.id;
    state.panelSignature = "";
    close();
    await loadSpace(id);
    setView("results");
  });
}
function dockerModal() {
  if (!state.session.capabilities.docker) {
    modal(
      '<h2>执行环境尚未连接</h2><p>这个服务还没有可用的容器执行器。你可以先记录实验方案，或使用内置模型。连接执行器后，代码、输入与结果会一起保存。</p><button class="primary" data-action="note">先记录实验想法</button>',
    );
    return;
  }
  const sample = `import math\nvalues = [(n, 1 / (0.2 + 0.8 / n)) for n in [1, 2, 4, 8, 16]]\nrows = ''.join(f'<tr><td>{n}</td><td>{s:.2f} 倍</td></tr>' for n, s in values)\nprint('<style>body{font:16px system-ui;padding:24px;color:#345040}td,th{padding:12px;border-bottom:1px solid #dde8d7}h1{font-size:22px}</style>')\nprint('<h1>增加执行者，会快多少？</h1><p>假设 80% 的工作可以并行，暂不计通信成本。</p>')\nprint('<table><tr><th>执行者</th><th>理论加速</th></tr>'+rows+'</table>')`;
  modal(
    `<h2>运行一个小实验</h2><p>Python 标准库环境。用 print 输出文字或完整 HTML；运行结果会出现在工作面板。每次运行最多 20 秒，网络关闭。</p><form id="docker-form" class="form-stack"><label>实验代码<textarea name="code" rows="15" required maxlength="16000" spellcheck="false">${esc(sample)}</textarea></label><button class="primary" type="submit">运行并保存结果</button></form>`,
  );
  bindForm("#docker-form", async (p) => {
    const id = await ensureSpace();
    await mutate(`/spaces/${id}/jobs`, {
      runner: "docker",
      input: { code: p.code },
    });
    close();
    await loadSpace(id);
    notify("实验已提交，可以继续讨论。");
  });
}
async function handoffModal() {
  if (!state.id) {
    modal(`<h2>用自己的 Agent 继续探索</h2><p>先发送当前问题，就能选择讨论与成果，生成接续材料。也可以直接在项目仓库中使用自己的 Agent。</p><a class="primary" href="${config.root}with-agent/index.html">查看使用方法</a>`);
    return;
  }
  const id = state.id, epoch = state.epoch;
  const data = await api(`/spaces/${id}/export`);
  if (id !== state.id || epoch !== state.epoch) return;
  const latest = new Map();
  for (const a of data.artifacts) if (!latest.has(a.id) || latest.get(a.id).version < a.version) latest.set(a.id, a);
  modal(`<h2>交给自己的 Agent</h2><p>写下下一步，选择要带走的材料。可预览、复制或下载；本站不会自动发送给其他服务。</p><form id="handoff-form" class="form-stack"><label>希望接下来做什么<textarea name="task" rows="3" required>继续探索：${esc(data.space.title)}</textarea></label><label class="check-option"><input type="checkbox" name="discussion">附上整段讨论，包括尚未完成的想法</label>${[...latest.values()].map((a) => `<label class="check-option"><input type="checkbox" name="version" value="${a.id}@${a.version}" ${a.id === state.selected ? "checked" : ""}>${esc(a.title)} · v${a.version}（含该版本的运行条件）</label>`).join("")}<label>接续材料预览<textarea id="handoff-preview" class="handoff-preview" rows="9" readonly></textarea></label><div class="artifact-actions"><button class="primary" type="submit">下载接续材料</button><button type="button" id="handoff-copy">复制接续材料</button><a href="${config.root}with-agent/index.html" target="_blank" rel="noopener">怎样交给 Codex 等 Agent？</a></div></form><details class="review-block"><summary>保存完整历史备份</summary><p>包含整段讨论、全部成果历史和任务记录，请作为私人存档保管。</p><button id="handoff-archive">下载完整 JSON 存档</button></details>`);
  const form = $("#handoff-form");
  const build = () => createAgentHandoff(data, {
    task: form.elements.task.value,
    discussion: form.elements.discussion.checked,
    versions: [...form.querySelectorAll('[name="version"]:checked')].map((input) => input.value),
  });
  const preview = () => { try { $("#handoff-preview").value = build(); } catch (error) { $("#handoff-preview").value = error.message; } };
  form.addEventListener("input", preview);
  preview();
  bindForm("#handoff-form", async () => download(`继续探索-${id}.md`, build(), "text/markdown;charset=utf-8"));
  $("#handoff-copy").onclick = safe(async () => {
    const text = build();
    try { await navigator.clipboard.writeText(text); notify("接续材料已复制，可粘贴到自己的 Agent。"); }
    catch { $("#handoff-preview").focus(); $("#handoff-preview").select(); notify("请复制已选中的材料，或下载文件。"); }
  });
  $("#handoff-archive").onclick = () => download(`探索-${id}.json`, data);
}
async function shareModal() {
  if (!state.id) {
    notify("先提出一个问题，再邀请大家一起探索。");
    return;
  }
  const s = state.space;
  modal(
    `<h2>一起把问题想明白</h2><p>共享后，能访问本站的人可以看到整段讨论、所有成果和实验，并主动加入。你的私人学习偏好不会随之共享。加入的成员可以共同操作工作浏览器，其中已登录的网站会话也会对成员开放。</p><p class="review-block">当前：${s.visibility === "shared" ? "本站共享" : "私人探索"} · ${state.data.members.length} 位参与者<br>${state.data.members.map((m) => esc(m.name)).join("、")}</p>${s.role === "owner" ? `<form class="form-stack" id="share-form"><label>探索范围<select name="visibility"><option value="private" ${s.visibility === "private" ? "selected" : ""}>仅创建者与已加入的成员</option><option value="shared" ${s.visibility === "shared" ? "selected" : ""}>共享给本站访问者，允许加入</option></select></label><p class="muted">改回私人会停止新的浏览与加入；已加入的成员仍可继续参与。已有读者可能已经保存共享内容。</p><button type="submit" class="primary">保存分享范围</button></form>` : "<p>分享范围由创建者维护。</p>"}<button class="secondary" data-action="copy-link" style="margin-top:14px">复制这段探索的地址</button>`,
  );
  if ($("#share-form"))
    bindForm("#share-form", async (p) => {
      await api(`/spaces/${s.id}/share`, { ...p, baseVersion: s.version });
      close();
      await loadSpace(s.id);
      await listSpaces();
    });
}
async function profileModal() {
  await sessionReady();
  const session = await api("/session");
  state.session = session;
  const p = session.preferences;
  modal(
    `<h2>怎样的帮助，对你更有用？</h2><p>这些是你主动告诉我们的偏好。可以随时改写或清空，你可以选择是否把这些偏好提供给自己使用的 Agent。不会据此给你贴固定的“学习类型”标签。</p><form class="form-stack" id="profile-form"><label>称呼<input name="name" value="${esc(session.name)}" required maxlength="40"></label><label>最近想学会什么<textarea name="goals" rows="2" maxlength="1500">${esc(p.goals || "")}</textarea></label><label>感兴趣的领域<textarea name="interests" rows="2" maxlength="1500">${esc(p.interests || "")}</textarea></label><label>你希望怎样获得帮助<textarea name="guidance" rows="2" maxlength="1500" placeholder="例如：先给我一个具体例子；卡住时直接解释。">${esc(p.guidance || "")}</textarea></label><small>${esc(session.message)}</small><button type="submit" class="primary">保存偏好</button></form>`,
  );
  bindForm("#profile-form", async (p) => {
    await api("/profile", p);
    $("#profile-name").textContent = p.name;
    close();
    notify("偏好已保存。");
  });
}
async function libraryModal() {
  const { documents } = await api("/knowledge");
  modal(
    `<h2>从探索中长出来的知识</h2><p>选择一份笔记，点击“沉淀为知识草稿”即可开始。正文自由组织，来源和修改记录单独保留。</p>${documents.length ? documents.map((d) => `<button class="library-item" data-document="${d.id}"><span>${esc(d.title)}<br><small>${d.visibility === "shared" ? "本站共享" : "私人"} · ${d.status === "maintained" ? "持续维护" : d.status === "archived" ? "已归档" : "草稿"}</small></span><small>v${d.version} →</small></button>`).join("") : '<p class="review-block">这里暂时没有知识草稿。探索中的笔记和实验不需要一开始就写成完整文章。</p>'}`,
  );
}
async function documentModal(id, { inline = false, sceneEpoch: epoch } = {}) {
  if (!inline) return showScene("knowledge", { document: id });
  const {
      document: d,
      versions,
      relations,
      relationsByVersion,
      provenance,
    } = await api(`/knowledge/${id}`),
    v = versions[0];
  const html =
    `<h1 id="scene-title" tabindex="-1">${esc(d.title)}</h1><p>v${d.version} · ${d.visibility === "shared" ? "本站共享" : "私人"} · ${d.status === "maintained" ? "持续维护（不等于已证实）" : d.status === "archived" ? "已归档" : "草稿"}</p><article class="markdown">${markdown(v.body)}</article><div class="review-block"><strong>依据与范围</strong>${(v.metadata.evidence || []).map((s) => (s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.label)} ↗</a>` : esc(s.label))).join("<br>") || "尚待补充"}<p>${esc(v.metadata.limits || "适用范围尚待梳理")}</p></div>${relations.length ? `<div class="review-block"><strong>与其他知识的关系</strong>${relations.map((r) => `${esc(r.kind)} → ${esc(r.target)}：${esc(r.reason)}`).join("<br>")}</div>` : ""}<div class="artifact-actions"><button id="edit-document">继续完善</button><button id="export-document">导出知识与历史</button><button id="document-history">修订历史</button></div>`;
  if (epoch !== sceneEpoch || state.document !== id) return;
  state.readingDocument = { ...d, summary: v.body.slice(0, 1200) };
  $("#scene-view").innerHTML = `<div class="reading-toolbar"><button class="secondary" data-action="knowledge">← 知识库</button><button class="primary" data-action="use-document">带回探索，继续问</button></div><div class="knowledge-reading">${html}</div>`;
  document.title = `${d.title} · 知图`;
  $("#scene-title").focus();
  $("#edit-document").onclick = () => editDocument(d, v, relations);
  $("#export-document").onclick = () =>
    download(`${d.id}.json`, {
      format: "knowledge-atlas/knowledge-1",
      directory: `knowledge/${d.id}/index.md`,
      document: d,
      versions,
      relations,
      relationsByVersion,
      provenance,
    });
  $("#document-history").onclick = () =>
    modal(
      `<h2>每一次修改，都留有来处。</h2>${versions.map((x) => `<details class="review-block"><summary>v${x.version} · ${esc(x.name)} · ${date(x.createdAt)}</summary><p>${esc(x.reason)}</p><p>审阅：${esc(x.metadata.reviews?.map((r) => r.result).join("；") || "未作内容审阅")}</p><article class="markdown">${markdown(x.body)}</article></details>`).join("")}`,
    );
}
function editDocument(d, v, relations) {
  const kinds = [
    "prerequisite",
    "explains",
    "applies-to",
    "example-of",
    "contrasts-with",
    "challenges",
  ];
  modal(
    `<h2>完善知识 · 基于 v${d.version}</h2><p>正文不需要固定章节。保存会产生新修订，别人已修改时会提示版本冲突。</p><form class="form-stack" id="document-form"><label>名称<input name="title" required value="${esc(d.title)}" maxlength="160"></label><label>正文<textarea name="body" required rows="12" maxlength="24000">${esc(v.body)}</textarea></label><label>依据 · 每行“说明 | 可选网址”<textarea name="evidence" rows="3">${esc((v.metadata.evidence || []).map((s) => s.label + (s.url ? " | " + s.url : "")).join("\n"))}</textarea></label><label>适用范围、未知与分歧<textarea name="limits" rows="3" maxlength="4000">${esc(v.metadata.limits || "")}</textarea></label><label>修改理由<input name="reason" required maxlength="2000"></label><label>本次审阅说明（可留空）<textarea name="review" rows="2" maxlength="4000" placeholder="哪些适用的检查已完成？仍缺什么？不适用的项目及理由。"></textarea></label><div class="form-row"><label>可见范围<select name="visibility" ${d.mine ? "" : "disabled"}><option value="private" ${d.visibility === "private" ? "selected" : ""}>私人</option><option value="shared" ${d.visibility === "shared" ? "selected" : ""}>本站共享</option></select></label><label>状态<select name="status" ${d.mine ? "" : "disabled"}><option value="draft" ${d.status === "draft" ? "selected" : ""}>草稿 · 可讨论</option><option value="maintained" ${d.status === "maintained" ? "selected" : ""}>持续维护</option><option value="archived" ${d.status === "archived" ? "selected" : ""}>归档</option></select></label></div><details><summary>知识关系 · 有助于理解时再添加</summary><p class="muted">每行：关系类型 | knowledge:已有条目 ID 或 document:草稿 ID | 关系理由。可请自己使用的 Agent 协助整理。类型：${kinds.join("、")}</p><textarea name="relations" rows="4">${esc(relations.map((r) => `${r.kind} | ${r.target} | ${r.reason}`).join("\n"))}</textarea></details><p class="muted">共享会发布本次保存的正文、依据和共享修订。之前的私人版本与会话不会公开。</p><button type="submit" class="primary">保存新修订</button></form>`,
  );
  bindForm("#document-form", async (p, form) => {
    const navigation = sceneEpoch;
    const evidence = p.evidence
      .split("\n")
      .filter((x) => x.trim())
      .map((line) => {
        const [label, ...url] = line.split("|");
        return { label: label.trim(), url: url.join("|").trim() };
      });
    const relations = p.relations
      .split("\n")
      .filter((x) => x.trim())
      .map((line) => {
        const [kind, target, ...reason] = line.split("|");
        return {
          kind: kind?.trim(),
          target: target?.trim(),
          reason: reason.join("|").trim(),
        };
      });
    try {
      await mutate(`/knowledge/${d.id}`, {
        ...p,
        visibility: p.visibility || d.visibility,
        status: p.status || d.status,
        baseVersion: d.version,
        evidence,
        relations,
      });
    } catch (error) {
      if (error.status === 409) {
        const current = await api(`/knowledge/${d.id}`);
        offerRebase(form, current.versions[0].body, () => {
          d.version = current.document.version;
        });
      }
      throw error;
    }
    if (navigation !== sceneEpoch || !form.isConnected || !$("#dialog").open) { notify("知识修订已保存，可以稍后从知识库查看。"); return; }
    await documentModal(d.id);
  });
}
function speak(text) {
  if (!("speechSynthesis" in window)) {
    notify("当前浏览器无法朗读，可继续阅读文字。");
    return;
  }
  if (speaking) {
    speechSynthesis.cancel();
    speaking = false;
    notify("朗读已停止，探索任务会继续。");
    return;
  }
  const u = new SpeechSynthesisUtterance(text.slice(0, 6000));
  u.lang = "zh-CN";
  u.onend = () => (speaking = false);
  u.onerror = () => {
    speaking = false;
    notify("朗读未完成，请使用文字。");
  };
  speaking = true;
  speechSynthesis.speak(u);
  notify("正在朗读，再点一次即可停止。");
}
let sceneEpoch = 0;
let sceneSpaces = null, sceneDocuments = null;
const sceneQueries = {}, scenePositions = {};
const sceneKey = () => `${state.scene}:${state.knowledge || state.document || state.environment || ''}:${state.environmentVersion || ''}`;
function updateRoute({ replace = false } = {}) {
  history[replace ? 'replaceState' : 'pushState']({}, '', workspaceUrl(appBase, state));
}
function updateSceneChrome() {
  const browsing = state.scene !== 'conversation';
  if (state.scene !== 'mine' && composerWrap.parentElement !== conversationHost) conversationHost.append(composerWrap);
  $('.back-to-scene').hidden = browsing || !state.returnScene;
  $('.back-to-scene').setAttribute('aria-label', `返回${sceneLabels[state.returnScene] || '列表'}`);
  $('.back-to-scene').title = `返回${sceneLabels[state.returnScene] || '列表'}`;
  $('.desk').dataset.scene = state.scene;
  $('.skip').href = browsing ? '#scene-title' : '#question-input';
  $('.skip').textContent = browsing ? '跳到内容' : '跳到输入';
  $('#scene-view').hidden = !browsing;
  $('.work-columns').hidden = browsing;
  $('.mobile-tabs').hidden = browsing;
  $('.header-actions').hidden = browsing;
  $('.new-question').hidden = browsing || !state.id;
  $('#space-title').hidden = browsing;
  $('#browse-title').hidden = !browsing;
  $('#browse-title').textContent = sceneLabels[state.scene];
  $('#header-context').textContent = browsing ? '学习空间' : '探索空间';
  $('.return-exploration').hidden = !browsing || (state.scene === 'mine' && !state.id);
  $('.return-exploration').textContent = state.id ? '返回当前探索' : '回到提问';
  $$('.rail-nav button').forEach(button => {
    const active = button.dataset.action === state.scene || (state.scene === 'conversation' && button.dataset.action === (state.space?.visibility === 'shared' ? 'shared' : 'mine'));
    button.classList.toggle('current', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.title = `${browsing ? sceneLabels[state.scene] : state.space?.title || '一起探索'} · 知图`;
  composerInput.refresh();
  if (browsing) closeJobStream();
  else if (state.data) syncJobStream();
  syncBrowserPanel();
}
async function showScene(scene, { knowledge = '', document: documentId = '', environment = '', environmentVersion = null, push = true } = {}) {
  scenePositions[sceneKey()] = $('#scene-view').scrollTop;
  composerInput.stop({ abort: true });
  saveDraft();
  if ($('#dialog').open) close();
  if (speaking) { speechSynthesis.cancel(); speaking = false; }
  state.scene = scene;
  state.knowledge = knowledge;
  state.document = documentId;
  state.environment = scene === 'practice' ? environment : '';
  state.environmentVersion = scene === 'practice' ? environmentVersion : null;
  const targetDraft = scene === 'mine' ? 'mine' : state.id;
  if (draftId !== targetDraft) restoreDraft(targetDraft);
  const epoch = ++sceneEpoch;
  if (push) updateRoute();
  updateSceneChrome();
  setMenu(false);
  if (scene === 'conversation') { composerInput.focus(); return; }
  const host = $('#scene-view');
  // Keep the live composer attached before replacing a browsing view.
  conversationHost.append(composerWrap);
  if (scene === 'mine' || scene === 'shared') {
    sceneSpaces = null;
    host.innerHTML = spaceScene(scene === 'shared', config.root);
    $('#scene-search').value = sceneQueries[scene] || '';
    if (scene === 'mine') {
      $('#mine-composer').append(composerWrap);
      $('#history-search').hidden = !sceneQueries.mine;
      $('[data-action="search-history"]').setAttribute('aria-expanded', String(Boolean(sceneQueries.mine)));
      renderAgentStatus();
      composerInput.refresh();
    }
  } else if (scene === 'knowledge' && !knowledge && !documentId) {
    sceneDocuments = null;
    host.innerHTML = knowledgeScene(config.knowledge, config.guides);
    $('#scene-search').value = sceneQueries[scene] || '';
    filterScene();
  } else if (scene === 'practice') host.innerHTML = environment ? '<div id="environment-library"><p class="scene-empty">正在读取环境…</p></div>' : practiceScene(config.root);
  else if (knowledge) {
    const k = config.knowledge.find(k => k.id === knowledge);
    if (!k) host.innerHTML = '<p class="scene-empty">没有找到这个知识条目。<button data-action="knowledge">返回知识库</button></p>';
    else {
      host.innerHTML = `<div class="reading-toolbar"><button class="secondary" data-action="knowledge">← 知识库</button><button class="secondary" data-action="seed-revisions">修订与历史</button><button class="primary" data-action="use-knowledge">带回探索，继续问</button></div><div class="knowledge-reading">${renderPublicKnowledge({ knowledge: k, guide: config.guides[k.id], questions: config.questions, knowledgeById: config.knowledge, root: config.root })}</div>`;
      document.title = `${k.titleZh || k.title} · 知图`;
    }
  } else host.innerHTML = '<p class="scene-empty" role="status">正在读取知识修订…</p>';
  host.scrollTop = scenePositions[sceneKey()] || 0;
  const heading = $('#scene-title') || $('h1', host);
  if (heading) { heading.id = 'scene-title'; heading.tabIndex = -1; heading.focus(); }
  try {
    if (scene === 'mine' || scene === 'shared') {
      const result = await api(`/spaces${scene === 'shared' ? '?view=shared' : ''}`);
      if (epoch !== sceneEpoch) return;
      sceneSpaces = result.spaces;
      filterScene();
    } else if (scene === 'knowledge' && !knowledge && !documentId) {
      const result = await api('/knowledge');
      if (epoch !== sceneEpoch) return;
      sceneDocuments = result.documents;
      filterScene();
    } else if (scene === 'practice') await environmentUI.mount($('#environment-library'), environment, environmentVersion, () => epoch === sceneEpoch);
    else if (documentId) await documentModal(documentId, { inline: true, sceneEpoch: epoch });
    if (epoch === sceneEpoch) host.scrollTop = scenePositions[sceneKey()] || 0;
  } catch (error) {
    if (epoch !== sceneEpoch) return;
    const target = $('#scene-items') || $('#document-items') || $('#environment-library') || host;
    target.innerHTML = `<div class="scene-empty"><p>${esc(error.message)}</p><button class="secondary" data-action="retry-scene">重新读取</button></div>`;
  }
}
function filterScene() {
  const query = $('#scene-search')?.value || '';
  if (sceneSpaces !== null && (state.scene === 'mine' || state.scene === 'shared')) $('#scene-items').innerHTML = spaceCards(sceneSpaces, state.scene === 'shared', query);
  if (state.scene === 'knowledge' && !state.knowledge && !state.document) {
    $('#seed-items').innerHTML = knowledgeCards(config.knowledge, config.guides, query);
    if (sceneDocuments !== null) $('#document-items').innerHTML = documentCards(sceneDocuments, query);
  }
}
const environmentUI = createEnvironmentUI({
  api, mutate, modal, close, notify, download, root: appBase,
  getScope: () => `${sceneEpoch}:${modalEpoch}`,
  navigate: (environment = '', environmentVersion = null, push = true) => showScene('practice', { environment, environmentVersion, push }),
  useEnvironment: prepareEnvironment,
});
async function prepareEnvironment(data) {
  const { environment: env, selected: version } = data;
  const originId = state.id, epoch = state.epoch, navigation = sceneEpoch;
  const current = state.space?.role && state.space.id === originId && ((env.visibility === 'shared' && version.sharedAt != null) || state.space.visibility === 'private');
  modal(`<h2>把环境带到探索</h2><p>将「${esc(env.title)}」v${version.version} 的文件复制为本次探索的固定快照，后续环境修订不会改变它。这一步准备资料，容器由自己的 Agent 构建与运行。</p><form class="form-stack" id="environment-use"><label>放在哪里<select name="destination">${current ? `<option value="current">当前探索（${state.space.visibility === 'shared' ? '本站共享' : '私人'}）：${esc(state.space.title)}</option>` : ''}<option value="new">新建一段私人探索</option></select></label><p>共享环境的既有副本不会因来源撤回分享而收回；私人环境只能放到私人探索。</p><button type="submit" class="primary">保存快照并打开探索</button></form>`);
  let prepared;
  bindForm('#environment-use', async (p, form) => {
    // Keep a successfully created destination if attachment saving needs a retry.
    if (p.destination === 'new' && !prepared) prepared = (await mutate('/spaces', { title: `实验：${env.title}`.slice(0,80), body: version.purpose, askAgent: false })).id;
    const spaceId = p.destination === 'current' ? originId : prepared;
    const result = await mutate(`/environments/${env.id}/use`, { spaceId, version: version.version });
    if (form.isConnected && $('#dialog').open && state.epoch === epoch && sceneEpoch === navigation) {
      close();
      const pending = selectSpace(spaceId), selectedEpoch = state.epoch, selectedScene = sceneEpoch;
      await pending;
      if (state.epoch !== selectedEpoch || sceneEpoch !== selectedScene || state.id !== spaceId || state.scene !== 'conversation') return;
      state.selected = result.id; state.panelSignature = '';
      const artifact = selected();
      if (artifact) renderArtifact(artifact);
      setView('results');
    } else notify('环境快照已保存到选定探索，可稍后返回查看。');
  });
}
function contextPill() {
  const c = state.context;
  $('#artifact-context').hidden = !c;
  if (c) $('#artifact-context').innerHTML = `<span>${c.kind === 'knowledge' ? '参考知识' : '接着讨论'}：${esc(c.title)} · v${c.version}</span><button data-action="clear-context" aria-label="移除参考">×</button>`;
}
async function bringKnowledge() {
  const k = config.knowledge.find(k => k.id === state.knowledge);
  if (!k) return;
  if (state.id && !state.space?.role) throw new Error('当前讨论尚未加入。请先加入，或开始自己的探索后再带入知识。');
  state.context = knowledgeContext(k, new URL(`knowledge/${k.id}/index.html`, appBase).href);
  contextPill();
  await showScene('conversation');
  if (!$('#question-input').value.trim()) $('#question-input').value = `关于「${k.titleZh || k.title}」，我想进一步弄明白：`;
  saveDraft();
  composerInput.focusText();
}
function startShared() {
  modal(`<h2>发起共同讨论</h2><p>写下一个想和大家推敲的问题。发布后，本站访问者可以阅读这段新讨论并加入。</p><form id="shared-form" class="form-stack"><label>一起探讨什么<textarea name="body" rows="5" required maxlength="12000" placeholder="比如：第一性原理和普通的拆解有什么区别？"></textarea></label><p class="review-block">这会新建一段本站共享的探索。当前私人探索和未发送草稿会保留。</p><button type="submit" class="primary">发布共同讨论</button></form>`);
  const origin = sceneEpoch;
  bindForm('#shared-form', async (p, form) => {
    const result = await mutate('/spaces', { body: p.body, visibility: 'shared' });
    if (origin === sceneEpoch && form.isConnected && $('#dialog').open) { close(); await selectSpace(result.id); }
    else { await listSpaces(); notify('共同讨论已发布，可从一起探讨中打开。'); }
  });
}
function openPractice(kind) {
  const p = practiceModels[kind];
  if (!p) return;
  const current = state.id && state.space?.role;
  modal(`<h2>${p.title}</h2><p>${p.description}</p><p class="review-block">${p.boundary} 每次运行保存独立条件与结果。</p><form class="form-stack" id="practice-form"><label>先留下你的预测（可留空）<textarea name="prediction" rows="2" maxlength="3000" placeholder="改变条件后，你觉得会发生什么？"></textarea></label><label>把实验放在哪里<select name="destination">${current ? `<option value="current">当前探索（${state.space.visibility === "shared" ? "本站共享" : "私人"}）：${esc(state.space.title)}</option>` : ''}<option value="new">新建一段私人探索</option></select></label><button type="submit" class="primary">运行并打开工作面板</button></form>`);
  const origin = state.id, epoch = state.epoch, browsing = sceneEpoch;
  let prepared = null, predictionSaved = false;
  bindForm('#practice-form', async (submitted, form) => {
    const pform = prepared?.settings || submitted;
    if (state.id !== origin || state.epoch !== epoch || browsing !== sceneEpoch) throw new Error('位置已改变，请重新选择实验。');
    let id = prepared?.id || origin;
    if (!prepared && pform.destination === 'new') {
      const result = await mutate('/spaces', { body: `${p.title}${pform.prediction.trim() ? '\n\n我的预测：' + pform.prediction.trim() : ''}`, askAgent: false });
      id = result.id;
    }
    prepared = { id, settings: pform };
    form.elements.destination.disabled = true;
    form.elements.prediction.readOnly = true;
    if (pform.destination !== 'new' && pform.prediction.trim() && !predictionSaved) {
      await mutate(`/spaces/${id}/messages`, { body: `实验前的预测：${pform.prediction.trim()}`, askAgent: false });
      predictionSaved = true;
    }
    // Store the run against the captured destination, even if navigation changes while saving.
    await mutate(`/spaces/${id}/jobs`, { runner: kind, input: kind === 'parallel' ? { p: 0.8, s: 4 } : { rain: 0.5, mode: 'observe' } });
    if (state.epoch !== epoch || sceneEpoch !== browsing || !form.isConnected || !$('#dialog').open) { await listSpaces(); notify('实验已保存在所选探索。'); return; }
    close();
    await selectSpace(id);
    setView('results');
  });
}

function practiceAssetModal(kind) {
  const current = state.id && state.space?.role;
  modal(`<h2>${kind === "python" ? "运行自己的 Python 实验" : "带回 Agent 成果"}</h2><p>先选择保存位置，再填写实验或导入文件。</p><form class="form-stack" id="practice-asset-form"><label>成果放在哪里<select name="destination">${current ? `<option value="current">当前探索（${state.space.visibility === "shared" ? "本站共享" : "私人"}）：${esc(state.space.title)}</option>` : ""}<option value="new">新建一段私人探索</option></select></label><button class="primary" type="submit">继续</button></form>`);
  const origin = state.id, epoch = state.epoch, browsing = sceneEpoch;
  bindForm("#practice-asset-form", async (p, form) => {
    if (origin !== state.id || epoch !== state.epoch || browsing !== sceneEpoch) throw new Error("位置已改变，请重新选择保存位置。");
    let id = origin;
    if (p.destination === "new") {
      const created = await mutate("/spaces", { body: kind === "python" ? "尝试一个 Python 实验" : "整理 Agent 带回的成果", askAgent: false });
      id = created.id;
    }
    if (state.epoch !== epoch || browsing !== sceneEpoch || !form.isConnected || !$("#dialog").open) { await listSpaces(); notify("探索已准备好，可以从最近探索继续。"); return; }
    close();
    if (id !== origin) await selectSpace(id);
    else await showScene("conversation");
    if (kind === "python") dockerModal();
    else noteModal({ importing: true });
  });
}
async function seedProposals() {
  const k = config.knowledge.find(k => k.id === state.knowledge);
  if (!k) return;
  const entry = { ...k, ...config.guides[k.id] };
  modal(`<h2>完善「${esc(k.titleZh || k.title)}」</h2><p>提案会向本站访问者公开，审阅后才进入正文。当前基于 v${k.version || 1}。</p><form class="form-stack" id="seed-proposal-form"><label>修改哪一部分<select name="field"><option value="summary">核心解释</option><option value="statement">准确陈述</option><option value="intuition">直觉解释</option><option value="example">具体例子</option><option value="check">自查问题</option></select></label><details><summary>比较当前正文</summary><pre class="artifact-meta" id="proposal-before">${esc(entry.summary)}</pre></details><label>你的修订<textarea name="afterText" rows="5" minlength="4" maxlength="10000" required>${esc(entry.summary)}</textarea></label><label>修改理由<textarea name="reason" rows="2" minlength="4" maxlength="3000" required></textarea></label><label>来源或证据说明<textarea name="sources" rows="2" minlength="4" maxlength="4000" required></textarea></label><label>你的称呼<input name="nickname" maxlength="40"></label><button class="primary" type="submit">提交公开修订提案</button><p id="proposal-status" role="status"></p></form><h3>版本与修订提案</h3><div id="proposal-history">正在读取…</div>`);
  const form = $('#seed-proposal-form');
  form.elements.field.onchange = () => {
    form.elements.afterText.value = entry[form.elements.field.value] || '';
    $('#proposal-before').textContent = entry[form.elements.field.value] || '';
  };
  const historyHost = $('#proposal-history');
  async function refresh() {
    try {
      const { revisions } = await publicApi(`revisions?target=${encodeURIComponent('knowledge:' + k.id)}`);
      if (!historyHost.isConnected) return;
      historyHost.innerHTML = proposalHistory(revisions, esc);
      $$('[data-proposal-download]', historyHost).forEach(b => b.onclick = () => download(`修订提案-${b.dataset.proposalDownload}.json`, revisions.find(r => r.id === b.dataset.proposalDownload)));
    } catch (error) { if (historyHost.isConnected) historyHost.textContent = error.message; }
  }
  bindForm('#seed-proposal-form', async p => {
    await publicApi('revisions', { ...p, target: `knowledge:${k.id}`, baseVersion: k.version || 1, beforeText: entry[p.field] });
    if (!form.isConnected) { notify('修订提案已保存。'); return; }
    $('#proposal-status').textContent = '提案已提交，等待审阅；正文尚未改变。';
    await refresh();
  });
  await refresh();
}

const selected = () =>
  state.data?.artifacts.find((a) => a.id === state.selected);
function startQuestion() {
  const pending = state.scene === 'mine' ? Promise.resolve() : showScene('mine');
  // The form moves synchronously; history loading must not delay or later steal focus.
  setMenu(false);
  scenePositions[sceneKey()] = 0;
  $('#scene-view').scrollTop = 0;
  composerWrap.scrollIntoView({ block: 'nearest' });
  composerInput.focus();
  return pending;
}
const actions = {
  "panel-browser": () => panelView("browser"),
  "panel-artifacts": () => panelView("artifacts"),
  "new-question": startQuestion,
  mine: startQuestion,
  shared: () => showScene("shared"),
  knowledge: () => showScene("knowledge"),
  practice: () => showScene("practice"),
  resume: () => state.id ? showScene("conversation") : startQuestion(),
  "back-scene": () => showScene(state.returnScene || "mine"),
  "start-shared": startShared,
  "focus-question": () => { composerInput.focus(); composerWrap.scrollIntoView({ block: "nearest" }); },
  "search-history": () => {
    const box = $("#history-search"), button = $('[data-action="search-history"]');
    box.hidden = !box.hidden;
    button.setAttribute("aria-expanded", String(!box.hidden));
    if (!box.hidden) $("#scene-search").focus();
    else { $("#scene-search").value = ""; sceneQueries.mine = ""; filterScene(); }
  },
  "retry-scene": () => showScene(state.scene, { knowledge: state.knowledge, document: state.document, environment: state.environment, environmentVersion: state.environmentVersion, push: false }),
  "use-knowledge": bringKnowledge,
  "seed-revisions": seedProposals,
  "use-document": async () => {
    const d = state.readingDocument;
    if (!d || d.id !== state.document) return;
    if (state.id && !state.space?.role) throw new Error("请先加入当前讨论，或开始自己的探索。");
    if (d.visibility !== "shared" && state.space?.visibility === "shared") throw new Error("这份知识是私人草稿，请在自己的私人探索中继续。");
    state.context = knowledgeContext(d, new URL(workspaceUrl(appBase, { scene: "knowledge", document: d.id }), location.origin).href);
    contextPill();
    await showScene("conversation");
    if (!$("#question-input").value.trim()) $("#question-input").value = `关于「${d.title}」，我想进一步弄明白：`;
    saveDraft(); composerInput.focusText();
  },
  "ask-search": async () => {
    const query = $("#scene-search").value.trim();
    await showScene("conversation");
    if (!$("#question-input").value.trim()) $("#question-input").value = `我想弄懂${query || "一个新的概念"}`;
    else $("#question-input").value += `\n\n我还想弄懂${query || "一个新的概念"}`;
    saveDraft(); composerInput.focusText();
  },
  "environment-new": () => environmentUI.edit(),
  "practice-python": () => practiceAssetModal("python"),
  "practice-import": () => practiceAssetModal("import"),
  menu: () => setMenu(!$("#rail").classList.contains("open"), { restoreFocus: true }),
  tools: toolsModal,
  note: () => noteModal(),
  import: () => noteModal({ importing: true }),
  handoff: () => handoffModal(),
  share: shareModal,
  profile: profileModal,
  voice: () => composerInput.toggleVoice(),
  library: () => showScene("knowledge"),
  join: async () => {
    await api(`/spaces/${state.id}/join`, {});
    await loadSpace(state.id);
    await listSpaces();
  },
  "copy-link": async () => {
    await navigator.clipboard.writeText(location.href);
    notify("地址已复制；访问仍遵循探索的分享范围。");
  },
  export: () => handoffModal(),
  "focus-artifact": () => {
    const a = selected();
    if (!a) return;
    state.context = { id: a.id, title: a.title, version: a.version };
    saveDraft();
    $("#artifact-context").innerHTML =
      `<span>接着讨论：${esc(a.title)} · v${a.version}</span><button data-action="clear-context">×</button>`;
    $("#artifact-context").hidden = false;
    setView("conversation");
    composerInput.focusText();
  },
  "clear-context": () => {
    $("#artifact-context").hidden = true;
    state.context = null;
    saveDraft();
  },
  "edit-artifact": () => {
    const a = selected();
    if (a)
      noteModal({ kind: a.kind, title: a.title, body: a.body, previous: a });
  },
  "open-environment": () => {
    const a = selected();
    if (a?.metadata.origin === 'environment') return showScene('practice', { environment: a.metadata.environment, environmentVersion: a.metadata.environmentVersion });
  },
  "note-result": () => {
    const a = selected();
    noteModal({
      title: `关于「${a.title}」的发现`,
      body: `本次探索：${state.space.title}\n\n参考成果：${a.title} v${a.version}\n运行标识：${a.metadata.runner || "手工成果"} / ${a.job || a.id}\n\n我观察到了什么：\n\n在什么条件下：\n\n还不能得出什么：`,
    });
  },
  "speak-artifact": () => {
    const a = selected();
    if (a)
      speak(
        a.kind === "html" ? "这是一个交互页面，请在面板里查看和操作。" : a.body,
      );
  },
  "download-artifact": () => {
    const a = selected();
    download(
      `${a.id}-v${a.version}.${a.kind === "html" ? "html" : a.kind === "model" ? "json" : "md"}`,
      a.body,
      a.kind === "html" ? "text/html" : "text/plain",
    );
  },
  history: async () => {
    const a = selected();
    const { versions } = await api(`/spaces/${state.id}/artifacts/${a.id}`);
    modal(
      `<h2>成果版本与运行依据</h2>${versions.map((v) => `<details class="review-block"><summary>v${v.version} · ${date(v.createdAt)}</summary><pre class="artifact-meta">${esc(JSON.stringify(v.metadata, null, 2))}</pre><pre class="artifact-meta">${esc(v.body)}</pre></details>`).join("")}`,
    );
  },
  distill: async () => {
    const a = selected();
    const d = await mutate(`/spaces/${state.id}/artifacts/${a.id}/knowledge`, {
      version: a.version,
    });
    await documentModal(d.id);
  },
};
document.addEventListener(
  "click",
  safe(async (e) => {
    const link = e.target.closest("a[data-knowledge-link], a[data-public-knowledge]");
    if (link && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      await showScene("knowledge", { knowledge: link.dataset.knowledgeLink || link.dataset.publicKnowledge });
      return;
    }
    const button = e.target.closest("button");
    if (!button) return;
    if (button.dataset.action && actions[button.dataset.action])
      await actions[button.dataset.action]();
    if (button.dataset.knowledge) await showScene("knowledge", { knowledge: button.dataset.knowledge });
    if (button.dataset.openDocument) await showScene("knowledge", { document: button.dataset.openDocument });
    if (button.dataset.practice) openPractice(button.dataset.practice);
    if (button.dataset.view) setView(button.dataset.view);
    if (button.dataset.prompt) {
      $("#question-input").value = button.dataset.prompt;
      saveDraft();
      composerInput.focusText();
    }
    if (button.dataset.space) await selectSpace(button.dataset.space);
    if (button.dataset.artifact) {
      state.selected = button.dataset.artifact;
      state.panelSignature = "";
      const a = selected();
      if (a) {
        panelView("artifacts");
        state.panelSignature = a.id + ":" + a.version;
        renderArtifact(a);
        setView("results");
      }
    }
    if (button.dataset.assistantMessage) {
      const id = state.id, epoch = state.epoch;
      button.disabled = true;
      try {
        await mutate(`/spaces/${id}/assistant`, { messageId: button.dataset.assistantMessage });
        if (state.id === id && state.epoch === epoch) await loadSpace(id);
        else notify("AI 回答已排入原探索，可以稍后返回查看。");
      } finally {
        if (button.isConnected) button.disabled = false;
      }
    }
    if (button.dataset.job) {
      const id = state.id, epoch = state.epoch;
      if (button.disabled) return;
      button.disabled = true;
      try {
        await mutate(`/spaces/${id}/jobs/${button.dataset.job}/${button.dataset.operation}`, {});
        if (id === state.id && epoch === state.epoch) await loadSpace(id, { quiet: true });
      } finally { if (button.isConnected) button.disabled = false; }
    }
    if (button.dataset.tool) {
      const kind = button.dataset.tool;
      if (kind === "note") noteModal();
      else if (kind === "html") noteModal({ kind: "html" });
      else if (kind === "docker") dockerModal();
      else if (kind === "agent") await handoffModal();
      else {
        close();
        await runModel(
          kind,
          kind === "parallel"
            ? { p: 0.8, s: 4 }
            : { rain: 0.5, mode: "observe" },
        );
      }
    }
    if (button.dataset.noteMessage) {
      const m = state.data.messages.find(
        (m) => m.id === button.dataset.noteMessage,
      );
      noteModal({
        title: m.body.slice(0, 50),
        body: m.body,
        sourceMessage: m.id,
      });
    }
    if (button.dataset.speakMessage) {
      speak(
        state.data.messages.find((m) => m.id === button.dataset.speakMessage)
          .body,
      );
    }
    if (button.dataset.document) await documentModal(button.dataset.document);
  }),
);
document.addEventListener("input", e => {
  if (e.target.id === "scene-search") { sceneQueries[state.scene] = e.target.value; filterScene(); }
});
document.addEventListener("keydown", (e) => {
  if (composerInput.handleShortcut(e)) return;
  if ((e.metaKey || e.ctrlKey) && e.key === "k") {
    e.preventDefault();
    if ($("#dialog").open) return;
    startQuestion().catch(error => notify(error.message));
  }
  if (e.key === "Escape") {
    setMenu(false, { restoreFocus: true });
    if (speaking) {
      speechSynthesis.cancel();
      speaking = false;
    }
  }
});
window.addEventListener(
  "popstate",
  safe(async () => {
    const targetUrl = location.href;
    const route = readWorkspaceRoute(targetUrl, routeDefaults);
    let pending;
    if (route.id !== state.id) {
      if (route.id) pending = selectSpace(route.id, { push: false, reveal: false });
      else newSpace({ push: false });
    }
    const navigation = ++sceneEpoch;
    await pending;
    if (navigation !== sceneEpoch || location.href !== targetUrl) return;
    state.returnScene = route.returnScene;
    await showScene(route.scene, { knowledge: route.knowledge, document: route.document, environment: route.environment, environmentVersion: route.environmentVersion, push: false });
  }),
);
window.addEventListener("pagehide", () => {
  composerInput.stop({ abort: true });
  saveDraft();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
});
async function connect() {
  try {
    state.session = state.session ? await api("/session") : await sessionReady();
    $("#profile-name").textContent = state.session.name;
    renderAgentStatus(state.session.capabilities);
    $("#connection-note").textContent =
      "探索自动保存 · 可导出资料，交给自己的 Agent 继续";
    await listSpaces();
    if (state.id) await loadSpace(state.id);
  } catch (error) {
    $("#agent-status").dataset.state = "unavailable";
    $("#agent-status").textContent = "无法确认 AI 连接 · 服务连接中断，输入会保留。";
    $("#connection-note").innerHTML =
      `${esc(error.message)} <button data-action="reconnect">重新连接</button>`;
  }
}
actions.reconnect = connect;
$('#dialog').addEventListener('close', () => { modalEpoch++; });
restoreDraft();
contextPill();
composerInput.refresh();
showScene(state.scene, { knowledge: state.knowledge, document: state.document, environment: state.environment, environmentVersion: state.environmentVersion, push: false }).then(() => {
  if (state.knowledge && ["#edit", "#history"].includes(location.hash)) return seedProposals();
}).catch(error => notify(error.message));
connect();
window.addEventListener("online", connect);
window.addEventListener("pagehide", () => { closeJobStream(); browserPanel.destroy(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden && state.id && state.scene === "conversation") loadSpace(state.id, { quiet: true }).catch(() => {}); });

setInterval(async () => {
  if (!state.id || state.scene !== "conversation" || document.hidden || state.polling || $("#dialog").open)
    return;
  state.polling = true;
  const id = state.id, epoch = state.epoch;
  try {
    await loadSpace(id, { quiet: true });
  } catch (error) {
    if (id !== state.id || epoch !== state.epoch) return;
    $("#agent-status").dataset.state = "unavailable";
    $("#agent-status").textContent = "无法确认 AI 连接 · 服务连接中断，输入会保留。";
    $("#connection-note").textContent = error.message;
  } finally {
    state.polling = false;
  }
}, 5000);
