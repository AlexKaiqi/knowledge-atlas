export function agentPresentation(capabilities, jobs = []) {
  if (!capabilities) return { state: "unknown", text: "正在检查 AI 连接…" };
  const name = capabilities.agentName || "AI";
  if (!capabilities.agent) {
    const reason = capabilities.agentReason || "当前服务没有连接可用的 Agent";
    return { state: "unavailable", text: `${name} 暂不可用 · ${reason.replace(/[。.!！]+$/, "")}${reason.includes("问题仍会保存") ? "。" : "。问题仍会保存。"}` };
  }
  const running = jobs.some((job) => job.runner === "codex" && job.status === "running");
  const queued = jobs.some((job) => job.runner === "codex" && job.status === "queued");
  return {
    state: running || queued ? "working" : "connected",
    text: `${name} 已连接 · ${running ? "正在回答，可以继续补充" : queued ? "问题已排队，等待回答" : "发送问题后会回复"}`,
  };
}

export function replyRequestTarget(messages = [], jobs = []) {
  const human = messages.findLast((message) => message.kind !== "assistant");
  if (!human || messages.some((message) => message.kind === "assistant" && message.replyTo === human.id)) return null;
  // Existing failures/cancellations must use the job's retry action, not enqueue another request.
  if (jobs.some((job) => job.runner === "codex" && job.messageId === human.id)) return null;
  return human;
}

export function visibleWorkspaceJobs(jobs = []) {
  const answeredMessages = new Set();
  return jobs.filter((job) => {
    if (job.runner !== "codex") return true;
    const key = job.messageId || job.id;
    if (answeredMessages.has(key)) return false;
    answeredMessages.add(key);
    return job.status !== "succeeded";
  });
}
