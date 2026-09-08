import { markdown } from "./markdown.js";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const activeJob = job => ["queued", "running"].includes(job.status);
export function newerJob(old, next) {
  if (!old) return next;
  if (!activeJob(old) && activeJob(next)) return old;
  if (next.updatedAt < old.updatedAt || (next.updatedAt === old.updatedAt && (next.progressVersion || 0) < (old.progressVersion || 0))) return old;
  return next;
}
export function jobLabel(job) {
  if (job.status === "queued") return "已收到，等待 Codex";
  if (job.status === "cancelled") return "已停止 · 部分内容尚未完成";
  if (job.status === "failed") return "本次任务未完成";
  if (job.status === "succeeded") return "本次探索已完成";
  return ({ connecting: "正在连接 Codex", workspace: "正在准备工作环境", thinking: "Codex 正在处理问题", answering: "Codex 正在输出", working: "Codex 正在操作环境", saving: "正在保存结果" })[job.progress?.stage] || "Codex 正在处理问题";
}
export function createAgentTimeline({ container, scroll, summary }) {
  const nodes = new Map(); let latestJobs = [];
  const elapsed = job => Math.max(0, Math.floor(((activeJob(job) ? Date.now() : job.updatedAt) - (job.progress?.startedAt || job.createdAt)) / 1000));
  function update(jobs, messages = []) {
    const latest = new Map();
    for (const job of jobs.filter(j => j.runner === "codex").sort((a,b) => b.createdAt-a.createdAt || b.attempt-a.attempt)) {
      const key = job.messageId || job.id; if (!latest.has(key)) latest.set(key, job);
    }
    latestJobs = [...latest.values()].filter(job => job.status !== "succeeded" || !messages.some(m=>m.id===job.id) || job.progress?.items?.some(i=>i.type==="tool"));
    const nearBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 130;
    for (const job of latestJobs) {
      let node = nodes.get(job.id);
      if (!node) {
        node = document.createElement("article"); node.className = "agent-turn"; node.dataset.agentJob = job.id;
        node.innerHTML = `<div class="agent-turn-head"><strong>Codex</strong><span class="agent-turn-status"></span><span class="agent-elapsed"></span><span class="agent-turn-actions"></span></div><details class="agent-activity"><summary>查看过程</summary><div></div></details><div class="agent-partial markdown"></div><p class="agent-turn-error"></p>`;
        nodes.set(job.id, node);
      }
      if (!node.isConnected) container.append(node);
      const anchor = document.getElementById("message-" + job.messageId);
      if (anchor && anchor.nextElementSibling !== node) anchor.after(node);
      node.dataset.status = job.status;
      node.querySelector(".agent-turn-status").textContent = jobLabel(job);
      node.querySelector(".agent-elapsed").textContent = `${elapsed(job)} 秒`;
      const action = activeJob(job) ? `<button data-job="${job.id}" data-operation="cancel">停止</button>` : ["failed", "cancelled"].includes(job.status) ? `<button data-job="${job.id}" data-operation="retry">重试</button>` : "";
      const actions = node.querySelector(".agent-turn-actions"); if (actions.innerHTML !== action) actions.innerHTML = action;
      const items = job.progress?.items || [], tools = items.filter(item => item.type === "tool");
      const detail = node.querySelector("details"), events = detail.querySelector("div");
      detail.hidden = !tools.length;
      const activity = tools.map(item => `<p><span>${item.status === "completed" ? "✓" : item.status === "failed" ? "!" : "·"}</span>${esc(item.text)}</p>`).join("");
      if (events.innerHTML !== activity) events.innerHTML = activity;
      const text = job.status === "succeeded" && messages.some(m => m.id === job.id) ? "" : items.filter(item => item.type === "message").map(item => item.text).join("\n\n");
      const body = node.querySelector(".agent-partial");
      if (body.dataset.text !== text && !(window.getSelection()?.isCollapsed === false && body.contains(window.getSelection()?.anchorNode))) { body.dataset.text = text; body.innerHTML = markdown(text); }
      node.querySelector(".agent-turn-error").textContent = job.error || "";
    }
    for (const [id, node] of nodes) if (!latestJobs.some(job => job.id === id)) { node.remove(); nodes.delete(id); }
    const active = latestJobs.find(activeJob);
    summary.hidden = !active;
    if (active) {
      const content = `<span>${esc(jobLabel(active))} · <span class="panel-elapsed">${elapsed(active)}</span> 秒</span><button data-job="${active.id}" data-operation="cancel">停止</button>`;
      if (summary.innerHTML !== content) summary.innerHTML = content;
    }
    if (nearBottom) scroll.scrollTop = scroll.scrollHeight;
  }
  setInterval(() => {
    for (const job of latestJobs.filter(activeJob)) {
      const node = nodes.get(job.id); if (node?.isConnected) node.querySelector(".agent-elapsed").textContent = `${elapsed(job)} 秒`;
    }
    const job = latestJobs.find(activeJob);
    if (job && !summary.hidden && summary.querySelector(".panel-elapsed")) summary.querySelector(".panel-elapsed").textContent = elapsed(job);
  }, 1000);
  return { update };
}
