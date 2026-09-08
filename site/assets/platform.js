import { parallelModel, causalModel } from "../runtime/core/learning-models.js";
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
$("[data-menu]")?.addEventListener("click", () => {
  const open = $("#navigation").classList.toggle("is-open");
  $("[data-menu]").setAttribute("aria-expanded", String(open));
});
let category = "all";
function filter() {
  let count = 0;
  const query = ($("[data-search-input]")?.value || "").trim().toLowerCase();
  $$("[data-search-item]").forEach((el) => {
    el.hidden =
      (category !== "all" && el.dataset.category !== category) ||
      !(el.dataset.search || "").toLowerCase().includes(query);
    if (!el.hidden) count++;
  });
  if ($("[data-search-empty]")) $("[data-search-empty]").hidden = count > 0;
}
$$("[data-filter]").forEach((b) =>
  b.addEventListener("click", () => {
    category = b.dataset.filter;
    $$("[data-filter]").forEach((x) => {
      x.classList.toggle("active", x === b);
      x.setAttribute("aria-pressed", String(x === b));
    });
    filter();
  }),
);
const base = new URL(document.body.dataset.root, location.href),
  params = new URLSearchParams(location.search);
const esc = (x) =>
  String(x ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
const date = (x) =>
  new Date(x).toLocaleString("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
let toastTimer;
function toast(message) {
  const n = $("[data-toast]");
  n.textContent = message;
  n.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (n.hidden = true), 4500);
}
let session;
async function api(path, body) {
  if (!session)
    session = fetch(new URL("api/session", base), {
      credentials: "same-origin",
    })
      .then((r) => {
        if (!r.ok)
          throw new Error("共享服务未连接。请保留输入，连接服务后再保存。");
      })
      .catch((e) => {
        session = null;
        throw e;
      });
  await session;
  const r = await fetch(new URL(`api/${path}`, base), {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  let result;
  try {
    result = await r.json();
  } catch {
    throw new Error("服务返回异常，请保留输入后重试。");
  }
  if (!r.ok) throw new Error(result.error || "操作没有完成，请稍后重试。");
  return result;
}
async function busy(button, fn, status) {
  if (button.disabled) return;
  button.disabled = true;
  if (status) status.textContent = "正在保存…";
  try {
    await fn();
  } catch (err) {
    if (status) status.textContent = err.message;
    else toast(err.message);
  } finally {
    button.disabled = false;
  }
}
function download(filename, value, type = "application/json") {
  const url = URL.createObjectURL(
    new Blob(
      [typeof value === "string" ? value : JSON.stringify(value, null, 2)],
      { type },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
async function copy(text, fallback) {
  try {
    await navigator.clipboard.writeText(text);
    toast("已复制，可以带到你使用的 AI 中继续。");
  } catch {
    fallback?.focus();
    fallback?.select();
    toast("请从文本框中手动复制。");
  }
}
function shareDraft(draft) {
  try {
    sessionStorage.setItem("atlas:discussion-draft", JSON.stringify(draft));
    location.href = new URL(
      "community/index.html?compose=" + draft.kind,
      base,
    ).href;
  } catch {
    download("讨论草稿.json", draft);
    toast("草稿已导出，可在讨论区手动发布。");
  }
}
if ($("[data-search-input]")) {
  const input = $("[data-search-input]");
  input.value = params.get("q") || "";
  const apply = () => {
    filter();
    const section = $("[data-knowledge-search]");
    if (section) {
      const term = input.value.trim().toLowerCase();
      let count = 0;
      $$("[data-concept-result]").forEach((c) => {
        c.hidden = !term || !c.dataset.search.toLowerCase().includes(term);
        if (!c.hidden) count++;
      });
      section.hidden = count === 0;
    }
  };
  input.addEventListener("input", apply);
  apply();
}
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    $("#navigation")?.classList.remove("is-open");
    $("[data-menu]")?.setAttribute("aria-expanded", "false");
  }
});
document.addEventListener("click", (event) => {
  if (
    $("#navigation")?.classList.contains("is-open") &&
    !event.target.closest("#navigation,[data-menu]")
  ) {
    $("#navigation").classList.remove("is-open");
    $("[data-menu]")?.setAttribute("aria-expanded", "false");
  }
});

if ($("[data-lesson]")) {
  const q = JSON.parse($("[data-lesson-data]").textContent);
  let record = {},
    previous = null,
    dirty = false;
  const reviewing = params.get("review") === "1";
  $("[data-lesson]").addEventListener("input", () => (dirty = true));
  function feedback(kind, value) {
    const question = q[kind];
    const output = $(`[data-${kind}-feedback]`);
    output.hidden = false;
    output.classList.toggle("error", value !== question.answer);
    output.textContent = question.feedback[value];
  }
  function progress() {
    const n =
      Number(Boolean(record.prediction)) +
      Number(Boolean(record.transfer)) +
      Number(Boolean($("[data-reflection]").value.trim()));
    $("[data-study-progress]").value = n;
    $("[data-study-status]").textContent =
      `已留下 ${n} / 3 项思考记录 · 可随时跳读`;
  }
  for (const kind of ["prediction", "transfer"])
    $(`[data-${kind}]`).addEventListener("submit", (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.currentTarget);
      const answer = Number(f.get(kind));
      record[kind] = {
        answer,
        correct: answer === q[kind].answer,
        confidence: f.get("confidence") || null,
        at: Date.now(),
      };
      feedback(kind, answer);
      progress();
    });
  $("[data-reflection]").addEventListener("input", progress);
  api("notes")
    .then(({ notes }) => {
      previous = notes.find((n) => n.target === `question:${q.id}`);
      if (!previous || dirty) return;
      if (reviewing) {
        $("[data-study-status]").textContent =
          "这次重访，先不看上次的作答，试着重新解释。";
        return;
      }
      record = previous.data || {};
      $("[data-reflection]").value = previous.body || "";
      if ($("[data-practice-note]"))
        $("[data-practice-note]").value = record.practice || "";
      for (const kind of ["prediction", "transfer"])
        if (record[kind]) {
          const selected = $(
            `input[name=${kind}][value="${record[kind].answer}"]`,
          );
          if (selected) {
            selected.checked = true;
            feedback(kind, record[kind].answer);
          }
        }
      if (record.prediction?.confidence)
        $("[name=confidence]").value = record.prediction.confidence;
      progress();
      $("[data-save-status]").textContent = "已恢复上次保存的思考。";
    })
    .catch((err) => ($("[data-save-status]").textContent = err.message));
  $("[data-save-lesson]").addEventListener("click", (ev) =>
    busy(
      ev.currentTarget,
      async () => {
        record = {
          ...record,
          reflection: $("[data-reflection]").value,
          practice: $("[data-practice-note]")?.value || "",
          questionVersion: q.version,
          attemptAt: Date.now(),
        };
        if (reviewing && previous)
          record.previousAttempt = {
            at: previous.updatedAt,
            prediction: previous.data?.prediction,
            transfer: previous.data?.transfer,
            reflection: previous.body,
          };
        const days = Number($("[data-review-days]").value);
        await api("notes", {
          target: `question:${q.id}`,
          title: q.title,
          body: record.reflection,
          data: record,
          stage: reviewing
            ? "reviewed"
            : record.transfer && record.reflection.trim()
              ? "explored"
              : "started",
          reviewAt: days ? Date.now() + days * 86400000 : null,
        });
        dirty = false;
        $("[data-save-status]").textContent =
          "已保存。可以在“我的学习”继续或导出。";
        toast("思考已保存。");
      },
      $("[data-save-status]"),
    ),
  );
  $("[data-share-reflection]").addEventListener("click", () =>
    shareDraft({
      kind: "question",
      target: `question:${q.id}`,
      title: `关于「${q.title}」的追问`,
      body: $("[data-reflection]").value || "我想继续追问：",
    }),
  );
  $("[data-ai-prompt]").addEventListener("click", () => {
    const text = `请作为有支架的学习伙伴，和我一起探讨「${q.title}」。\n\n目标：${q.goals.join("；")}\n场景：${q.scenario}\n我的思考：${$("[data-reflection]").value || "我还没有形成完整解释。"}\n初始判断：${record.prediction ? q.prediction.choices[record.prediction.answer] : "尚未作答"}\n\n请一次只追问一个问题，必要时给提示、例子或直接解释。允许我跳读。不要因为我点过按钮就判断已掌握，不要替我编造实验。\n\n本单元资料 v${q.version}：\n${q.layers.map((l) => `${l.title}：${l.text}\n例子：${l.example}\n边界：${l.boundary}`).join("\n\n")}\n\n可核查知识入口：\n${q.knowledge.map((id) => new URL(`knowledge/${id}/index.html`, base).href).join("\n")}\n资料链接可能需要访问权限；无法访问时请说明，不要假装读过。\n\n先问我：${q.hints[0]}`;
    const output = $("[data-ai-output]");
    output.value = text;
    output.hidden = false;
    $("[data-copy-ai]").hidden = false;
  });
  $("[data-copy-ai]").addEventListener("click", () =>
    copy($("[data-ai-output]").value, $("[data-ai-output]")),
  );
}

async function loadRevisions(container) {
  try {
    const target = container.dataset.target || "";
    const { revisions } = await api(
      "revisions" + (target ? "?target=" + encodeURIComponent(target) : ""),
    );
    container.innerHTML = revisions.length
      ? revisions
          .map(
            (r) =>
              `<article class="thread-card"><div class="thread-meta"><span class="tag orange">${r.status === "merged" ? "已合入" : r.status === "rejected" ? "已关闭" : "待审阅"}</span><b>${esc(r.nickname)}</b><span>${date(r.createdAt)}</span><span>基于 v${r.baseVersion}</span></div><h3><a href="${new URL("knowledge/" + r.target.split(":")[1] + "/index.html#history", base)}">${{ summary: "核心解释", statement: "准确陈述", intuition: "直觉解释", example: "具体例子", check: "自查问题" }[r.field] || "词条"}的修订提案 ↗</a></h3><p class="user-content">${esc(r.reason)}</p><details><summary>查看修改前后与依据</summary><div class="editor-grid section"><div class="diff-box before">${esc(r.beforeText)}</div><div class="diff-box after">${esc(r.afterText)}</div></div><p class="user-content section">依据：${esc(r.sources)}</p><button class="button small section" data-export-revision="${esc(r.id)}">导出提案</button></details></article>`,
          )
          .join("")
      : '<div class="empty-state">还没有修订提案。一个更清楚的例子，就可以成为第一次贡献。</div>';
    $$("[data-export-revision]", container).forEach((b) =>
      b.addEventListener("click", () =>
        download(
          `修订提案-${b.dataset.exportRevision}.json`,
          revisions.find((r) => r.id === b.dataset.exportRevision),
        ),
      ),
    );
  } catch (err) {
    container.innerHTML = `<p class="empty-state">${esc(err.message)}<br>当前正文仍可阅读。</p>`;
  }
}
$$("[data-revisions]").forEach(loadRevisions);
if ($("[data-wiki]")) {
  const k = JSON.parse($("[data-wiki-data]").textContent),
    form = $("[data-revision-form]");
  const update = () => {
    const field = form.elements.field.value;
    $("[data-diff-before]").textContent = k[field];
    $("[data-diff-after]").textContent = form.elements.afterText.value;
  };
  form.elements.field.addEventListener("change", () => {
    form.elements.afterText.value = k[form.elements.field.value];
    update();
  });
  form.elements.afterText.addEventListener("input", update);
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    busy(
      $("button[type=submit]", form),
      async () => {
        const data = Object.fromEntries(new FormData(form));
        await api("revisions", {
          ...data,
          target: `knowledge:${k.id}`,
          baseVersion: k.version || 1,
          beforeText: k[data.field],
        });
        $("[data-revision-status]").textContent =
          "提案已提交并保留，等待审阅；当前正文尚未改变。";
        await loadRevisions($("[data-revisions]"));
        toast("修订提案已提交。");
      },
      $("[data-revision-status]"),
    );
  });
}

if ($("[data-discussions]")) {
  const container = $("[data-discussions]"),
    dialog = $("[data-compose-dialog]"),
    form = $("[data-discussion-form]");
  let rows = [],
    kind = "all";
  const target = params.get("target") || "";
  const open = () => {
    if (!dialog.open) dialog.showModal();
  };
  $("[data-compose]").addEventListener("click", open);
  $("[data-close-dialog]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (ev) => {
    if (ev.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (
        ev.clientX < rect.left ||
        ev.clientX > rect.right ||
        ev.clientY < rect.top ||
        ev.clientY > rect.bottom
      )
        dialog.close();
    }
  });
  if (
    target &&
    [...form.elements.target.options].some((o) => o.value === target)
  ) {
    form.elements.target.value = target;
    $("[data-community-heading]").textContent =
      form.elements.target.selectedOptions[0].textContent;
  }
  if (params.has("compose")) {
    if (
      Object.keys({
        question: 1,
        idea: 1,
        evidence: 1,
        experiment: 1,
      }).includes(params.get("compose"))
    )
      form.elements.kind.value = params.get("compose");
    try {
      const draft = JSON.parse(
        sessionStorage.getItem("atlas:discussion-draft") || "null",
      );
      if (draft) {
        for (const key of ["kind", "target", "title", "body"])
          if (form.elements[key] && draft[key])
            form.elements[key].value = draft[key];
        sessionStorage.removeItem("atlas:discussion-draft");
      }
    } catch {}
    open();
  }
  const labels = {
    question: "问题",
    idea: "探讨",
    evidence: "证据",
    experiment: "实践",
  };
  function render() {
    const threads = rows.filter(
      (r) => !r.parent && (kind === "all" || r.kind === kind),
    );
    container.innerHTML = threads.length
      ? threads
          .map(
            (t) =>
              `<article class="thread-card" id="thread-${esc(t.id)}"><div class="thread-meta"><span class="tag">${labels[t.kind]}</span><b>${esc(t.nickname)}</b><span>${date(t.createdAt)}</span>${t.target !== "general" ? "<span>有内容关联</span>" : ""}</div><h3>${esc(t.title)}</h3><div class="user-content">${esc(t.body)}</div>${rows
                .filter((r) => r.parent === t.id)
                .sort((a, b) => a.createdAt - b.createdAt)
                .map(
                  (r) =>
                    `<div class="reply"><div class="thread-meta">${esc(r.nickname)} · ${date(r.createdAt)}</div><p class="user-content">${esc(r.body)}</p></div>`,
                )
                .join(
                  "",
                )}<details><summary>回应这个想法 · ${t.replyCount ?? rows.filter((r) => r.parent === t.id).length} 条回复</summary><form data-reply-form="${t.id}"><label class="field"><span>你的回应</span><textarea name="body" rows="3" required minlength="2" maxlength="12000" placeholder="你有什么不同解释、证据或追问？"></textarea></label><label class="field"><span>你的称呼</span><input name="nickname" maxlength="40" placeholder="好奇的访客"></label><button class="button small" type="submit">发布回复</button><p class="status-line" role="status"></p></form></details></article>`,
          )
          .join("")
      : '<div class="empty-state"><h3>这里还留着一个空位。</h3><p>成为第一个提出问题的人。一个未完成的想法，也值得一起探讨。</p></div>';
    $$("[data-reply-form]", container).forEach((f) =>
      f.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const t = rows.find((r) => r.id === f.dataset.replyForm);
        busy(
          $("button", f),
          async () => {
            await api("discussions", {
              ...Object.fromEntries(new FormData(f)),
              target: t.target,
              kind: t.kind,
              parent: t.id,
              title: "回复",
            });
            await load();
            toast("回复已发布。");
          },
          $(".status-line", f),
        );
      }),
    );
  }
  async function load() {
    try {
      ({ discussions: rows } = await api(
        "discussions" + (target ? "?target=" + encodeURIComponent(target) : ""),
      ));
      render();
    } catch (err) {
      container.innerHTML = `<p class="empty-state">${esc(err.message)}</p>`;
    }
  }
  $$("[data-community-filter]").forEach((b) =>
    b.addEventListener("click", () => {
      kind = b.dataset.communityFilter;
      $$("[data-community-filter]").forEach((x) => {
        x.classList.toggle("active", x === b);
        x.setAttribute("aria-pressed", String(x === b));
      });
      render();
    }),
  );
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    busy(
      $("button[type=submit]", form),
      async () => {
        const result = await api(
          "discussions",
          Object.fromEntries(new FormData(form)),
        );
        form.elements.title.value = "";
        form.elements.body.value = "";
        dialog.close();
        await load();
        toast("已发布到讨论空间。");
        document
          .getElementById("thread-" + result.id)
          ?.scrollIntoView({ block: "center", behavior: "smooth" });
      },
      $("[data-discussion-status]"),
    );
  });
  load();
}

if ($("[data-notes]")) {
  let notes = [],
    filterName = "all";
  const container = $("[data-notes]");
  const labels = {
    started: "已开始",
    explored: "已探索",
    reviewed: "已重访",
    saved: "实验记录",
  };
  function href(n, review = false) {
    const [kind, id] = n.target.split(":");
    return new URL(
      kind === "question"
        ? `questions/${id}/index.html${review ? "?review=1" : ""}`
        : id === "agent"
          ? `cases/tests-green-wrong/index.html${n.id ? "?observation=" + encodeURIComponent(n.id) : ""}`
          : `practice/${id}/index.html${n.id ? "?observation=" + encodeURIComponent(n.id) : ""}`,
      base,
    ).href;
  }
  function render() {
    const list = notes.filter(
      (n) =>
        filterName === "all" ||
        (filterName === "due"
          ? n.reviewAt && n.reviewAt <= Date.now()
          : n.target.startsWith("practice:")),
    );
    container.innerHTML = list.length
      ? list
          .map(
            (n) =>
              `<article class="notebook-card"><div class="thread-meta"><span class="tag">${labels[n.stage] || "学习记录"}</span><span>${date(n.updatedAt)}</span>${n.reviewAt ? `<span class="tag ${n.reviewAt <= Date.now() ? "orange" : ""}">${n.reviewAt <= Date.now() ? "可以重访了" : date(n.reviewAt) + " 重访"}</span>` : ""}</div><h3>${esc(n.title)}</h3><p class="user-content">${esc(n.body || "还没留下文字解释。可以回到问题继续。")}</p>${n.data?.result ? `<details class="hint"><summary>查看当时的参数与结果</summary><pre>${esc(JSON.stringify(n.data.result, null, 2))}</pre></details>` : ""}<div class="actions"><a class="button small" href="${href(n)}">继续探索 →</a>${n.target.startsWith("question:") ? `<a class="button small" href="${href(n, true)}">不看上次答案，再试一次</a>` : ""}</div></article>`,
          )
          .join("")
      : `<div class="empty-state"><h3>${filterName === "due" ? "目前没有到期的重访" : "给自己的理解，留一页纸。"}</h3><p>在导学或实验中保存思考，这里就会留下你的记录。</p><a class="button small section" href="${new URL("paths/index.html", base)}">找一个问题开始 →</a></div>`;
  }
  api("notes")
    .then((r) => {
      notes = r.notes;
      render();
    })
    .catch(
      (err) =>
        (container.innerHTML = `<p class="empty-state">${esc(err.message)}</p>`),
    );
  $$("[data-notes-filter]").forEach((b) =>
    b.addEventListener("click", () => {
      filterName = b.dataset.notesFilter;
      $$("[data-notes-filter]").forEach((x) =>
        x.classList.toggle("active", x === b),
      );
      render();
    }),
  );
  $("[data-export-notes]").addEventListener("click", (ev) =>
    busy(ev.currentTarget, async () => {
      const data = await api("notes");
      download(
        "知图-学习档案-" + new Date().toISOString().slice(0, 10) + ".json",
        { schemaVersion: 1, exportedAt: new Date().toISOString(), ...data },
      );
      toast("学习档案已导出。");
    }),
  );
}

if ($("[data-experiment]")) {
  const kind = $("[data-experiment]").dataset.experiment;
  let result;
  function render() {
    if (kind === "parallel") {
      const p = Number($("[data-parallel-p]").value) / 100,
        s = Number($("[data-parallel-s]").value);
      result = parallelModel(p, s);
      $("[data-p-output]").textContent = `${Math.round(p * 100)}%`;
      $("[data-s-output]").textContent = `${s} 倍`;
      $("[data-original-serial]").style.width = `${(1 - p) * 100}%`;
      $("[data-original-parallel]").style.width = `${p * 100}%`;
      $("[data-new-serial]").style.width = `${result.serial * 100}%`;
      $("[data-new-parallel]").style.width = `${result.parallel * 100}%`;
      $("[data-speedup]").textContent = result.speedup.toFixed(2);
      $("[data-time-label]").textContent = `${(result.time * 100).toFixed(1)}%`;
      $("[data-limit]").textContent =
        result.limit === null
          ? "全部工作都可加速时，本模型的整体加速等于局部加速。"
          : `即使局部无限快，总体也不超过 ${result.limit.toFixed(2)} 倍。`;
    } else {
      const rain = Number($("[data-causal-rain]").value) / 100,
        mode = $("[data-causal-mode]").value;
      result = causalModel(rain, mode);
      $("[data-rain-output]").textContent = `${Math.round(rain * 100)}%`;
      for (const [name, val] of [
        ["wet-umbrella", result.umbrella],
        ["wet-without", result.without],
      ])
        $(`[data-${name}]`).textContent = `${(val * 100).toFixed(1)}%`;
      $("[data-umbrella-bar]").style.width = `${result.umbrella * 100}%`;
      $("[data-without-bar]").style.width = `${result.without * 100}%`;
      $("[data-causal-result]").textContent =
        result.difference > 0 ? "带伞组反而更常淋湿" : "带伞组更少淋湿";
      $("[data-causal-explanation]").textContent =
        mode === "observe"
          ? `带伞组中暴雨占 ${(result.rainWithUmbrella * 100).toFixed(1)}%，不带伞组只有 ${(result.rainWithoutUmbrella * 100).toFixed(1)}%。两组原本面对的天气不同。`
          : "两组采用相同的天气结构。模型中，伞在两种天气下都有保护作用。";
    }
  }
  $$("input[type=range],select", $("[data-experiment]")).forEach((x) =>
    x.addEventListener("input", () => {
      render();
      $("[data-experiment-status]").textContent =
        "条件已改变；之前保存的记录不会跟着改变。";
    }),
  );
  $("[data-experiment-reset]").addEventListener("click", () => {
    if (kind === "parallel") {
      $("[data-parallel-p]").value = 80;
      $("[data-parallel-s]").value = 4;
    } else {
      $("[data-causal-rain]").value = 50;
      $("[data-causal-mode]").value = "observe";
    }
    render();
    $("[data-experiment-status]").textContent = "已恢复初始条件。";
  });
  render();
  let modified = false;
  $("[data-experiment]").addEventListener("input", () => (modified = true));
  if (params.has("observation"))
    api("notes")
      .then(({ notes }) => {
        const saved = notes.find(
          (n) =>
            n.id === params.get("observation") &&
            n.target === `practice:${kind}`,
        );
        if (!saved || modified) return;
        const r = saved.data.result;
        if (kind === "parallel") {
          $("[data-parallel-p]").value = Math.round(r.p * 100);
          $("[data-parallel-s]").value = r.s;
        } else {
          $("[data-causal-rain]").value = Math.round(r.rain * 100);
          $("[data-causal-mode]").value = r.mode;
        }
        $("[data-experiment-prediction]").value = saved.data.prediction || "";
        $("[data-experiment-note]").value = saved.body;
        render();
        $("[data-experiment-status]").textContent =
          "已恢复这次实验；再次保存会新增记录，原记录保留。";
      })
      .catch(
        (err) => ($("[data-experiment-status]").textContent = err.message),
      );
  const title = kind === "parallel" ? "并行与瓶颈实验" : "相关与因果实验";
  $("[data-save-experiment]").addEventListener("click", (ev) =>
    busy(
      ev.currentTarget,
      async () => {
        const note = $("[data-experiment-note]").value;
        await api("notes", {
          target: `practice:${kind}`,
          title,
          body: note,
          data: {
            result: { ...result },
            prediction: $("[data-experiment-prediction]").value,
            modelVersion: 1,
            recordedAt: Date.now(),
          },
          stage: "saved",
          reviewAt: null,
        });
        $("[data-experiment-status]").textContent =
          "当时的参数与观察已保存到“我的学习”。";
        toast("实验记录已保存。");
      },
      $("[data-experiment-status]"),
    ),
  );
  $("[data-share-experiment]").addEventListener("click", () =>
    shareDraft({
      kind: "experiment",
      target: `practice:${kind}`,
      title: title + "：一次观察",
      body: `我的预测：${$("[data-experiment-prediction]").value}\n\n模型参数与结果：\n${JSON.stringify(result, null, 2)}\n\n观察与边界：${$("[data-experiment-note]").value}\n\n这是给定教学模型的结果，不是现实测量。`,
    }),
  );
}

if ($("[data-author-checklist]")) {
  const m = JSON.parse($("[data-methods-data]").textContent);
  $$("[data-author-checklist] input").forEach((x) =>
    x.addEventListener("change", () => {
      const count = $$("[data-author-checklist] input:checked").length;
      $("[data-checklist-status]").textContent =
        `已自查 ${count} / ${m.checklist.length} 项 · 仍需内容审阅`;
    }),
  );
  $("[data-download-template]").addEventListener("click", () =>
    download(
      "新知识引入模板.md",
      `# 知识草稿\n\n正文自由组织，以下是审阅参考，并非固定章节。\n\n考虑：回答什么？解释与依据是什么？适用范围和未知在哪里？如何继续探索？\n\n${m.checklist.map((c) => `- ${c.title}\n  - 适用性及理由：\n  - 满足 / 需改进 / 不适用：\n  - 参考：${c.human}`).join("\n")}\n\n审阅者（Agent / 人）：\n方法规则版本：${m.version}\n真实试学（未做则明确未做）：\n`,
      "text/markdown",
    ),
  );
}

let latestAgentRun = null;
document.addEventListener("atlas:agent-run", (ev) => {
  latestAgentRun = ev.detail;
});
$("[data-save-agent]")?.addEventListener("click", (ev) =>
  busy(ev.currentTarget, async () => {
    if (!latestAgentRun) throw new Error("请先运行一次实验，再保存结果。");
    await api("notes", {
      target: "practice:agent",
      title: "Agent 证据实验",
      body: "一次冻结验收条件的运行。可在参数记录中比较策略与真实结果。",
      data: { result: latestAgentRun, recordedAt: Date.now() },
      stage: "saved",
      reviewAt: null,
    });
    toast("这次实验的条件与结果已保存。");
  }),
);

if ($("[data-agent-notebook]") && params.has("observation")) {
  api("notes")
    .then(({ notes }) => {
      const saved = notes.find(
        (n) =>
          n.id === params.get("observation") && n.target === "practice:agent",
      );
      if (!saved) return;
      for (const input of $$("[data-harness-id]")) {
        input.checked = Boolean(
          saved.data.result.harness[input.dataset.harnessId],
        );
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      toast("已恢复保存时的验收条件。请重新运行，比较新的轨迹与结果。");
    })
    .catch((err) => toast(err.message));
}

if ($("[data-service-knowledge]")) {
  api("workspace/knowledge")
    .then(({ documents }) => {
      $("[data-service-knowledge]").innerHTML = documents.length
        ? documents
            .map(
              (d) =>
                `<a class="wiki-row" data-search-item data-search="${esc(d.title)}" href="../index.html?doc=${d.id}"><div><span class="tag">${d.status === "draft" ? "草稿 · 可讨论" : d.status === "archived" ? "已归档" : "纳入维护"}</span><h2>${esc(d.title)}</h2><p>${d.visibility === "shared" ? "本站共享" : "私人"} · v${d.version}</p></div><span>→</span></a>`,
            )
            .join("")
        : '<p class="muted">新的解释与发现可以从探索工作区整理为知识草稿。</p>';
      filter();
    })
    .catch((error) => {
      $("[data-service-knowledge]").textContent = error.message;
    });
}
