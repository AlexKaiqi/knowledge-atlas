import { parallelModel, causalModel } from "../runtime/core/learning-models.js";
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
const state = {
  id: new URL(location).searchParams.get("s"),
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
  epoch: 0,
};
const initialPanel = $("#panel-content").innerHTML;
let notificationTimer,
  earliest = null,
  voice = null,
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
function saveDraft(id = state.id) {
  try {
    sessionStorage.setItem(
      "atlas-input:" + (id || "new"),
      $("#question-input").value,
    );
  } catch {}
}
function restoreDraft(id = state.id) {
  try {
    $("#question-input").value =
      sessionStorage.getItem("atlas-input:" + (id || "new")) ||
      (!id ? config.initialQuestion || "" : "");
  } catch {}
}
$("#question-input").addEventListener("input", () => saveDraft());

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
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
function markdown(text) {
  let code = false;
  return (
    text
      .split("\n")
      .map((line) => {
        if (line.startsWith("```")) {
          code = !code;
          return code ? "<pre><code>" : "</code></pre>";
        }
        if (code) return esc(line) + "\n";
        let t = esc(line)
          .replace(/`([^`]+)`/g, "<code>$1</code>")
          .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
        const heading = t.match(/^(#{1,3}) (.*)$/);
        if (heading)
          return `<h${heading[1].length}>${heading[2]}</h${heading[1].length}>`;
        if (t.startsWith("&gt; "))
          return `<blockquote>${t.slice(5)}</blockquote>`;
        if (/^[-*] /.test(t)) return `<p>· ${t.slice(2)}</p>`;
        return t ? `<p>${t}</p>` : "<br>";
      })
      .join("") + (code ? "</code></pre>" : "")
  );
}
function setView(view) {
  $(".work-columns").dataset.view = view;
  $$("[data-view]")
    .filter((x) => x.tagName === "BUTTON")
    .forEach((b) => {
      b.classList.toggle("selected", b.dataset.view === view);
      b.setAttribute("aria-pressed", String(b.dataset.view === view));
    });
}
function modal(html) {
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
  if (voice) {
    voice.abort();
    voice = null;
  }
  $("#dialog").close();
}
$("#dialog").addEventListener("close", () => {
  if (voice) {
    voice.abort();
    voice = null;
  }
});
function bindForm(selector, handler) {
  $(selector).addEventListener(
    "submit",
    safe(async (e) => {
      e.preventDefault();
      const form = e.currentTarget,
        button = $("[type=submit]", form);
      if (button.disabled) return;
      button.disabled = true;
      try {
        await handler(Object.fromEntries(new FormData(form)), form);
      } finally {
        button.disabled = false;
      }
    }),
  );
}
async function listSpaces() {
  const result = await api(
    `/spaces${state.view === "shared" ? "?view=shared" : ""}`,
  );
  $("#recent-label").textContent =
    state.view === "shared" ? "本站共同探索" : "最近探索";
  $("#spaces").innerHTML = result.spaces.length
    ? result.spaces
        .map(
          (s) =>
            `<button data-space="${s.id}" class="${s.id === state.id ? "selected" : ""}" title="${esc(s.title)}">${esc(s.title)}</button>`,
        )
        .join("")
    : `<p class="muted">${state.view === "shared" ? "还没有共享探索。" : "第一段探索，从你的问题开始。"}</p>`;
}
async function loadSpace(id, { quiet = false } = {}) {
  const epoch = state.epoch;
  const data = await api(`/spaces/${id}`);
  if (id !== state.id || epoch !== state.epoch) return;
  if (state.data?.space.id === id) {
    const combined = new Map(state.data.messages.map((m) => [m.id, m]));
    for (const m of data.messages) combined.set(m.id, m);
    data.messages = [...combined.values()].sort((a, b) => a.cursor - b.cursor);
    data.hasEarlier = state.data.hasEarlier;
  }
  state.data = data;
  state.space = data.space;
  state.loading = false;
  $("#welcome").hidden = true;
  $("#space-title").textContent = data.space.title;
  $("#privacy-badge").textContent =
    data.space.visibility === "shared" ? "本站共享" : "仅自己";
  $("#join-box").hidden = !!data.space.role;
  $("#composer textarea").disabled = !data.space.role;
  $(".send-button").disabled = !data.space.role;
  const sig = JSON.stringify(data.messages);
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
    : "探索自动保存 · AI 引导待接入，可先讨论和动手实验";
}
function renderMessages(messages) {
  $("#messages").innerHTML = messages
    .map(
      (m) =>
        `<article class="message ${m.mine ? "mine" : ""}" id="message-${m.id}"><div class="message-meta"><b>${esc(m.name)}${m.mine ? " · 我" : ""}</b><span>${date(m.createdAt)}</span></div><div class="message-body">${esc(m.body)}</div><div class="message-tools"><button data-note-message="${m.id}">整理为笔记</button><button data-speak-message="${m.id}">朗读</button></div></article>`,
    )
    .join("");
}
const statuses = {
  queued: "等待执行",
  running: "正在运行",
  succeeded: "已完成",
  failed: "执行未完成",
  cancelled: "已停止",
  waiting_provider: "等待接入 AI 引导",
};
function renderJobs(jobs) {
  const html = jobs
    .map(
      (j) =>
        `<div class="job-card ${j.status}"><div><i class="job-dot"></i><b>${esc(j.runner === "agent" ? "探索助手" : j.runner === "docker" ? "Python 实验" : j.runner === "parallel" ? "并行协作模型" : "相关与因果模型")}</b><span>· ${statuses[j.status] || j.status}</span></div>${j.status === "waiting_provider" ? "<p>问题与后续任务已保存。在线模型尚未配置，目前没有 Agent 在后台回答。</p>" : ""}${j.error ? `<p>${esc(j.error)}</p>` : ""}${j.artifact ? `<button data-artifact="${j.artifact}">查看成果 →</button>` : ""}${["queued", "running", "waiting_provider"].includes(j.status) ? `<button data-job="${j.id}" data-operation="cancel">停止任务</button>` : ""}${["failed", "cancelled"].includes(j.status) ? `<button data-job="${j.id}" data-operation="retry">按原条件重试</button>` : ""}<small class="muted"> ${date(j.updatedAt)}</small></div>`,
    )
    .join("");
  if ($("#jobs").innerHTML !== html) $("#jobs").innerHTML = html;
}
async function selectSpace(id, { push = true } = {}) {
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
  if (push)
    history.pushState(
      {},
      "",
      id ? `${location.pathname}?s=${id}` : location.pathname,
    );
  $("#space-title").textContent = "正在载入探索…";
  $("#welcome").hidden = true;
  $("#messages").innerHTML = "";
  $("#jobs").innerHTML = "";
  $("#artifact-tabs").innerHTML = "";
  $("#panel-content").innerHTML = "<p class=muted>正在载入成果…</p>";
  $("#question-input").disabled = true;
  $(".send-button").disabled = true;
  restoreDraft(id);
  $("#rail").classList.remove("open");
  $("[data-action=menu]").setAttribute("aria-expanded", "false");
  await loadSpace(id);
  await listSpaces();
}
function newSpace({ push = true } = {}) {
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
  if (push) history.pushState({}, "", location.pathname);
  restoreDraft();
  $("#welcome").hidden = false;
  $("#messages").innerHTML = "";
  $("#jobs").innerHTML = "";
  $("#artifact-tabs").innerHTML = "";
  $("#panel-content").innerHTML = initialPanel;
  $("#space-title").textContent = "新的好奇";
  $("#privacy-badge").textContent = "仅自己";
  $("#mobile-count").textContent = "0";
  $("#join-box").hidden = true;
  $("#load-earlier").hidden = true;
  $("#artifact-context").hidden = true;
  $("#question-input").disabled = false;
  $(".send-button").disabled = false;
  $("#rail").classList.remove("open");
  setView("conversation");
  $("#question-input").focus();
}
async function ensureSpace() {
  if (state.loading || (state.id && !state.space))
    throw new Error("探索尚未载入，连接恢复后再试。");
  if (state.id) return state.id;
  const data = await mutate("/spaces", {
    body: $("#question-input").value.trim() || "一段新的探索",
  });
  await selectSpace(data.id);
  return data.id;
}
bindForm("#composer", async () => {
  if (state.loading) throw new Error("正在载入，请稍候。");
  const input = $("#question-input"),
    raw = input.value,
    body = raw.trim(),
    scope = state.id,
    epoch = state.epoch;
  if (!body) return;
  const context = state.context,
    text = context
      ? `关于「${context.title}」v${context.version}\n\n${body}`
      : body;
  if (!scope) {
    const result = await mutate("/spaces", { body: text });
    if (state.epoch === epoch) {
      if (input.value === raw) {
        input.value = "";
        saveDraft();
      }
      await selectSpace(result.id);
    } else notify("问题已保存，可以从最近探索继续。");
  } else {
    await mutate(`/spaces/${scope}/messages`, { body: text });
    if (state.epoch === epoch) {
      if (input.value === raw) {
        input.value = "";
        saveDraft();
      }
      await loadSpace(scope);
    }
  }
  await listSpaces();
  if (state.epoch === epoch || (state.id && !scope)) setView("conversation");
});
$("#question-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.isComposing) {
    e.preventDefault();
    $("#composer").requestSubmit();
  }
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
  renderMessages(state.data.messages);
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
  $("#panel-content").innerHTML =
    `<div class="artifact-heading"><div><h2>${esc(a.title)}</h2><small>v${a.version} · ${date(a.createdAt)} · ${a.metadata.origin === "execution" ? "实际运行结果" : esc(a.name || "参与者")}</small></div><button class="icon-button" data-action="speak-artifact" aria-label="朗读成果">▷</button></div>${body}<div class="artifact-meta">${esc(a.metadata.boundary || "可继续补充和修订；保存新版本不会覆盖旧内容。")}</div><div class="artifact-actions"><button data-action="focus-artifact">围绕它继续说</button>${["markdown", "html"].includes(a.kind) ? '<button data-action="edit-artifact">修改成果</button>' : ""}<button data-action="history">版本与运行条件</button>${a.kind === "markdown" ? '<button data-action="distill">沉淀为知识草稿</button>' : '<button data-action="note-result">整理发现</button>'}<button data-action="download-artifact">下载</button></div>`;
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
    return `<form class="model-form" id="model-form"><label>可并行的工作比例 <output id="p-label">${Math.round(input.p * 100)}%</output><input name="p" type="range" min="0" max="100" value="${input.p * 100}"></label><label>一起执行的数量 <output id="s-label">${input.s}</output><input name="s" type="range" min="1" max="64" value="${Math.min(input.s, 64)}"></label><div class="model-metric"><strong id="metric">${result.speedup.toFixed(2)}×</strong><span>模型中的速度提升 · 下方调整为预览</span></div><button class="primary" type="submit">运行并保存这组条件</button></form>`;
  return `<form class="model-form" id="model-form"><label>下雨的比例 <output id="rain-label">${Math.round(input.rain * 100)}%</output><input name="rain" type="range" min="5" max="95" value="${input.rain * 100}"></label><label>比较方式<select name="mode"><option value="observe" ${input.mode === "observe" ? "selected" : ""}>观察带伞和没带伞的人</option><option value="intervene" ${input.mode === "intervene" ? "selected" : ""}>在相同天气比例下比较</option></select></label><div class="model-bars" id="model-bars">${causalBars(result)}</div><button class="primary" type="submit">运行并保存这组条件</button></form>`;
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
    `<h2>让这个问题，往前走一步。</h2><p>选择一种表达方式。成果会留在当前探索中，也可以随时再修改。</p><div class="tool-grid"><button data-tool="note"><b>一份自由笔记</b><small>解释、来源、还没想通的地方</small></button><button data-tool="html"><b>一个交互页面</b><small>放入 HTML，成为可操作的面板</small></button><button data-tool="parallel"><b>并行协作实验</b><small>增加人手，会带来多少改变？</small></button><button data-tool="causal"><b>相关与因果实验</b><small>改变比较方式，观察结论</small></button><button data-tool="docker"><b>Python 实验</b><small>${state.session?.capabilities.docker ? "在隔离环境里执行并展示结果" : "云端执行器尚未接入"}</small></button><button data-tool="agent"><b>留给探索助手</b><small>记录希望 Agent 调研或创建的任务</small></button></div>`,
  );
}
function noteModal({
  kind = "markdown",
  body = "",
  title = "",
  sourceMessage = null,
  previous = null,
} = {}) {
  modal(
    `<h2>${previous ? "继续完善成果" : kind === "html" ? "创建一个交互面板" : "记下值得留下的想法"}</h2><p>${kind === "html" ? "内容会在隔离面板中展示，支持内联样式与脚本。外部资源与请求受限，页面无法直接访问主站凭据。" : "正文可以自由写。一个还没讲完的解释，也可以先保存。"}</p><form class="form-stack" id="artifact-form"><label>名称<input name="title" value="${esc(title)}" required maxlength="160"></label><label>${kind === "html" ? "HTML 内容" : "正文 · 支持 Markdown"}<textarea name="body" rows="12" maxlength="24000" required placeholder="${kind === "html" ? "粘贴或编写一个可操作的 HTML 页面" : "你在解释什么？有哪些发现或还没想通的地方？"}">${esc(body)}</textarea></label>${previous ? '<label>这次修改了什么<input name="reason" required maxlength="2000"></label>' : ""}<button class="primary" type="submit">${previous ? "保存新版本" : "保存到工作面板"}</button></form>`,
  );
  bindForm("#artifact-form", async (p, form) => {
    const id = await ensureSpace();
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
      if (error.status === 409 && previous) {
        const current = await api(`/spaces/${id}/artifacts/${previous.id}`);
        offerRebase(form, current.versions[0].body, () => {
          previous.version = current.versions[0].version;
        });
      }
      throw error;
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
function agentModal() {
  modal(
    '<h2>你希望探索助手做什么？</h2><p>在线模型尚未接入。任务会保存为“等待接入”，不会模拟正在回答。后续接入时可以继续这段探索。</p><form id="agent-form" class="form-stack"><label>任务<textarea name="prompt" rows="5" required placeholder="例如：找出两种解释各自的依据，做一个可以调整参数的实验。"></textarea></label><button class="primary" type="submit">保存任务</button></form>',
  );
  bindForm("#agent-form", async (p) => {
    const id = await ensureSpace();
    await mutate(`/spaces/${id}/jobs`, { runner: "agent", input: p });
    close();
    await loadSpace(id);
  });
}
async function shareModal() {
  if (!state.id) {
    notify("先提出一个问题，再邀请大家一起探索。");
    return;
  }
  const s = state.space;
  modal(
    `<h2>一起把问题想明白</h2><p>共享后，能访问本站的人可以看到整段讨论、所有成果和实验，并主动加入。你的私人学习偏好不会随之共享。</p><p class="review-block">当前：${s.visibility === "shared" ? "本站共享" : "私人探索"} · ${state.data.members.length} 位参与者<br>${state.data.members.map((m) => esc(m.name)).join("、")}</p>${s.role === "owner" ? `<form class="form-stack" id="share-form"><label>探索范围<select name="visibility"><option value="private" ${s.visibility === "private" ? "selected" : ""}>仅创建者与已加入的成员</option><option value="shared" ${s.visibility === "shared" ? "selected" : ""}>共享给本站访问者，允许加入</option></select></label><p class="muted">改回私人会停止新的浏览与加入；已加入的成员仍可继续参与。已有读者可能已经保存共享内容。</p><button type="submit" class="primary">保存分享范围</button></form>` : "<p>分享范围由创建者维护。</p>"}<button class="secondary" data-action="copy-link" style="margin-top:14px">复制这段探索的地址</button>`,
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
    `<h2>怎样的帮助，对你更有用？</h2><p>这些是你主动告诉我们的偏好。可以随时改写或清空，后续 Agent 可以据此调整引导。不会据此给你贴固定的“学习类型”标签。</p><form class="form-stack" id="profile-form"><label>称呼<input name="name" value="${esc(session.name)}" required maxlength="40"></label><label>最近想学会什么<textarea name="goals" rows="2" maxlength="1500">${esc(p.goals || "")}</textarea></label><label>感兴趣的领域<textarea name="interests" rows="2" maxlength="1500">${esc(p.interests || "")}</textarea></label><label>你希望怎样获得帮助<textarea name="guidance" rows="2" maxlength="1500" placeholder="例如：先给我一个具体例子；卡住时直接解释。">${esc(p.guidance || "")}</textarea></label><small>${esc(session.message)}</small><button type="submit" class="primary">保存偏好</button></form>`,
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
async function documentModal(id) {
  const {
      document: d,
      versions,
      relations,
      relationsByVersion,
      provenance,
    } = await api(`/knowledge/${id}`),
    v = versions[0];
  modal(
    `<h2>${esc(d.title)}</h2><p>v${d.version} · ${d.visibility === "shared" ? "本站共享" : "私人"} · ${d.status === "maintained" ? "持续维护（不等于已证实）" : d.status === "archived" ? "已归档" : "草稿"}</p><article class="markdown">${markdown(v.body)}</article><div class="review-block"><strong>依据与范围</strong>${(v.metadata.evidence || []).map((s) => (s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.label)} ↗</a>` : esc(s.label))).join("<br>") || "尚待补充"}<p>${esc(v.metadata.limits || "适用范围尚待梳理")}</p></div>${relations.length ? `<div class="review-block"><strong>与其他知识的关系</strong>${relations.map((r) => `${esc(r.kind)} → ${esc(r.target)}：${esc(r.reason)}`).join("<br>")}</div>` : ""}<div class="artifact-actions"><button id="edit-document">继续完善</button><button id="export-document">导出知识与历史</button><button id="document-history">修订历史</button></div>`,
  );
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
    `<h2>完善知识 · 基于 v${d.version}</h2><p>正文不需要固定章节。保存会产生新修订，别人已修改时会提示版本冲突。</p><form class="form-stack" id="document-form"><label>名称<input name="title" required value="${esc(d.title)}" maxlength="160"></label><label>正文<textarea name="body" required rows="12" maxlength="24000">${esc(v.body)}</textarea></label><label>依据 · 每行“说明 | 可选网址”<textarea name="evidence" rows="3">${esc((v.metadata.evidence || []).map((s) => s.label + (s.url ? " | " + s.url : "")).join("\n"))}</textarea></label><label>适用范围、未知与分歧<textarea name="limits" rows="3" maxlength="4000">${esc(v.metadata.limits || "")}</textarea></label><label>修改理由<input name="reason" required maxlength="2000"></label><label>本次审阅说明（可留空）<textarea name="review" rows="2" maxlength="4000" placeholder="哪些适用的检查已完成？仍缺什么？不适用的项目及理由。"></textarea></label><div class="form-row"><label>可见范围<select name="visibility" ${d.mine ? "" : "disabled"}><option value="private" ${d.visibility === "private" ? "selected" : ""}>私人</option><option value="shared" ${d.visibility === "shared" ? "selected" : ""}>本站共享</option></select></label><label>状态<select name="status" ${d.mine ? "" : "disabled"}><option value="draft" ${d.status === "draft" ? "selected" : ""}>草稿 · 可讨论</option><option value="maintained" ${d.status === "maintained" ? "selected" : ""}>持续维护</option><option value="archived" ${d.status === "archived" ? "selected" : ""}>归档</option></select></label></div><details><summary>知识关系 · 有助于理解时再添加</summary><p class="muted">每行：关系类型 | knowledge:已有条目 ID 或 document:草稿 ID | 关系理由。Agent 后续负责协助维护。类型：${kinds.join("、")}</p><textarea name="relations" rows="4">${esc(relations.map((r) => `${r.kind} | ${r.target} | ${r.reason}`).join("\n"))}</textarea></details><p class="muted">共享会发布本次保存的正文、依据和共享修订。之前的私人版本与会话不会公开。</p><button type="submit" class="primary">保存新修订</button></form>`,
  );
  bindForm("#document-form", async (p, form) => {
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
    await documentModal(d.id);
  });
}
async function voiceModal() {
  const Recognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  modal(
    `<h2>说出来，再确认一下。</h2><p>${Recognition ? "语音会转成可编辑文字，确认后再发送。识别由当前浏览器提供，可能使用浏览器厂商的在线服务；本站不保存原始音频。" : "当前浏览器不支持语音识别。可以使用手机键盘的听写输入，之后接入语音模型也会保留文字入口。"}</p><div class="voice-state" id="voice-state" role="status">${Recognition ? "麦克风尚未开启" : "你可以继续使用文字输入。"}</div>${Recognition ? '<button class="primary" id="voice-start">开始说话</button><button class="secondary" id="voice-stop" hidden>停止并编辑</button>' : ""}`,
  );
  if (!Recognition) return;
  $("#voice-start").onclick = safe(async () => {
    voice = new Recognition();
    voice.lang = "zh-CN";
    voice.continuous = true;
    voice.interimResults = true;
    let transcript = "",
      base = $("#question-input").value;
    voice.onresult = (e) => {
      transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join("");
      $("#voice-state").textContent = transcript || "正在听…";
    };
    voice.onerror = (e) => {
      $("#voice-state").textContent =
        e.error === "not-allowed"
          ? "未获得麦克风权限，仍可用文字输入。"
          : `识别中断（${e.error}），可以停止后编辑已识别的文字。`;
    };
    voice.onend = () => {
      if (transcript)
        $("#question-input").value = base + (base ? "\n" : "") + transcript;
      voice = null;
      if ($("#voice-state")) {
        $("#voice-state").classList.remove("active");
        $("#voice-state").textContent = transcript
          ? "文字已放入输入框，可以修改后发送。"
          : "识别已停止，可以重试。";
        $("#voice-start").hidden = false;
        $("#voice-stop").hidden = true;
      }
    };
    voice.start();
    $("#voice-state").classList.add("active");
    $("#voice-state").textContent = "正在听…";
    $("#voice-start").hidden = true;
    $("#voice-stop").hidden = false;
  });
  $("#voice-stop").onclick = () => {
    voice?.stop();
  };
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
const selected = () =>
  state.data?.artifacts.find((a) => a.id === state.selected);
const actions = {
  new: newSpace,
  mine: async () => {
    state.view = "mine";
    await listSpaces();
  },
  shared: async () => {
    state.view = "shared";
    await listSpaces();
    $("#rail").classList.add("open");
  },
  menu: () => {
    const open = $("#rail").classList.toggle("open");
    $("[data-action=menu]").setAttribute("aria-expanded", String(open));
  },
  tools: toolsModal,
  note: () => noteModal(),
  share: shareModal,
  profile: profileModal,
  voice: voiceModal,
  library: libraryModal,
  join: async () => {
    await api(`/spaces/${state.id}/join`, {});
    await loadSpace(state.id);
    await listSpaces();
  },
  "copy-link": async () => {
    await navigator.clipboard.writeText(location.href);
    notify("地址已复制；访问仍遵循探索的分享范围。");
  },
  export: async () => {
    if (!state.id) {
      notify("先开始一段探索，再导出。");
      return;
    }
    download(`探索-${state.id}.json`, await api(`/spaces/${state.id}/export`));
  },
  "focus-artifact": () => {
    const a = selected();
    if (!a) return;
    state.context = { id: a.id, title: a.title, version: a.version };
    $("#artifact-context").innerHTML =
      `<span>接着讨论：${esc(a.title)} · v${a.version}</span><button data-action="clear-context">×</button>`;
    $("#artifact-context").hidden = false;
    setView("conversation");
    $("#question-input").focus();
  },
  "clear-context": () => {
    $("#artifact-context").hidden = true;
    state.context = null;
  },
  "edit-artifact": () => {
    const a = selected();
    if (a)
      noteModal({ kind: a.kind, title: a.title, body: a.body, previous: a });
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
    const button = e.target.closest("button");
    if (!button) return;
    if (button.dataset.action && actions[button.dataset.action])
      await actions[button.dataset.action]();
    if (button.dataset.view) setView(button.dataset.view);
    if (button.dataset.prompt) {
      $("#question-input").value = button.dataset.prompt;
      $("#question-input").focus();
    }
    if (button.dataset.space) await selectSpace(button.dataset.space);
    if (button.dataset.artifact) {
      state.selected = button.dataset.artifact;
      state.panelSignature = "";
      const a = selected();
      if (a) {
        state.panelSignature = a.id + ":" + a.version;
        renderArtifact(a);
        setView("results");
      }
    }
    if (button.dataset.job) {
      await mutate(
        `/spaces/${state.id}/jobs/${button.dataset.job}/${button.dataset.operation}`,
        {},
      );
      await loadSpace(state.id);
    }
    if (button.dataset.tool) {
      const kind = button.dataset.tool;
      if (kind === "note") noteModal();
      else if (kind === "html") noteModal({ kind: "html" });
      else if (kind === "docker") dockerModal();
      else if (kind === "agent") agentModal();
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
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "k") {
    e.preventDefault();
    newSpace();
  }
  if (e.key === "Escape") {
    $("#rail").classList.remove("open");
    if (speaking) {
      speechSynthesis.cancel();
      speaking = false;
    }
  }
});
window.addEventListener(
  "popstate",
  safe(async () => {
    const id = new URL(location).searchParams.get("s");
    if (id) await selectSpace(id, { push: false });
    else newSpace({ push: false });
  }),
);
window.addEventListener("pagehide", () => {
  voice?.abort();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
});
async function connect() {
  try {
    state.session = await sessionReady();
    $("#profile-name").textContent = state.session.name;
    $("#connection-note").textContent =
      "探索自动保存 · AI 引导待接入，可先讨论和动手实验";
    await listSpaces();
    const doc = new URL(location).searchParams.get("doc");
    if (state.id) await loadSpace(state.id);
    if (doc) await documentModal(doc);
  } catch (error) {
    $("#connection-note").innerHTML =
      `${esc(error.message)} <button data-action="reconnect">重新连接</button>`;
  }
}
actions.reconnect = connect;
restoreDraft();
connect();
window.addEventListener("online", connect);

setInterval(async () => {
  if (!state.id || document.hidden || state.polling || $("#dialog").open)
    return;
  state.polling = true;
  try {
    await loadSpace(state.id, { quiet: true });
  } catch (error) {
    $("#connection-note").textContent = error.message;
  } finally {
    state.polling = false;
  }
}, 5000);
