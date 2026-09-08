// Local execution adapter only. Production must connect an isolated execution
// service, not expose this process or a host Docker socket to generated content.
import { spawn, execFileSync } from "node:child_process";
import { claimJob, finishJob, failJob, recoverJobs } from "./jobs.mjs";
const IMAGE = "python:3.13-alpine";
export function dockerCapability() {
  try {
    const inspect = JSON.parse(
      execFileSync("docker", ["image", "inspect", IMAGE], {
        timeout: 4000,
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 256000,
      }),
    );
    return { image: inspect[0].Id };
  } catch {
    return null;
  }
}
async function removeContainer(name) {
  await new Promise((resolve) => {
    const command = spawn("docker", ["rm", "-f", name], { stdio: "ignore" });
    const timer = setTimeout(() => {
      command.kill("SIGKILL");
      resolve();
    }, 5000);
    command.once("error", () => {
      clearTimeout(timer);
      resolve();
    });
    command.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
export function startDockerRunner(db, configuration) {
  let closed = false,
    busy = false;
  const active = new Map();
  async function execute(id) {
    const job = await claimJob(db, id);
    if (!job) return;
    const name = `atlas-${job.id}`;
    const args = [
      "run",
      "--rm",
      "-i",
      "--name",
      name,
      "--label",
      "knowledge-atlas=experiment",
      "--network=none",
      "--read-only",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges",
      "--pids-limit=48",
      "--memory=128m",
      "--cpus=0.5",
      "--user=65534:65534",
      "--tmpfs=/tmp:rw,noexec,nosuid,size=16m",
      configuration.image,
      "timeout",
      "-s",
      "KILL",
      "20",
      "python",
      "-I",
      "-B",
      "-",
    ];
    let killed = false,
      output = "",
      error = "",
      tooLarge = false;
    const proc = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    let removal = Promise.resolve();
    const kill = () => {
      if (killed) return;
      killed = true;
      removal = removeContainer(name);
      proc.kill("SIGKILL");
    };
    active.set(job.id, kill);
    const timeout = setTimeout(kill, 20000);
    const check = setInterval(async () => {
      try {
        const live = await db
          .prepare("SELECT status,lease FROM ws_jobs WHERE id=?")
          .bind(job.id)
          .first();
        if (!live || live.status !== "running" || live.lease !== job.lease)
          kill();
      } catch {
        kill();
      }
    }, 700);
    proc.stdout.on("data", (c) => {
      output += c.toString();
      if (Buffer.byteLength(output) > 24000) {
        tooLarge = true;
        kill();
      }
    });
    proc.stderr.on("data", (c) => {
      if (error.length < 3000) error += c.toString();
    });
    proc.stdin.on("error", () => {});
    try {
      const exit = await new Promise((resolve, reject) => {
        proc.once("error", reject);
        proc.once("close", resolve);
        proc.stdin.end(JSON.parse(job.input).code);
      });
      if (exit !== 0 || killed)
        throw new Error(
          tooLarge
            ? "结果超过 24 KB，请缩小输出。"
            : killed
              ? "运行已停止或超过 20 秒。"
              : error || `执行退出：${exit}`,
        );
      if (!output.trim())
        throw new Error(
          "运行完成但没有输出。使用 print 输出观察或 HTML 页面。",
        );
      await finishJob(db, job, {
        title: "Python 探索结果",
        kind: /^\s*</.test(output) ? "html" : "markdown",
        body: output,
        metadata: {
          image: configuration.image,
          timeoutSeconds: 20,
          network: "none",
          code: JSON.parse(job.input).code,
          boundary: "隔离容器的实际输出；结论仍需核查代码、输入与假设。",
        },
      });
    } catch (e) {
      await failJob(db, job, e.message);
    } finally {
      clearTimeout(timeout);
      clearInterval(check);
      await removal;
      active.delete(job.id);
    }
  }
  async function tick() {
    if (closed || busy) return;
    busy = true;
    try {
      const expired = (
        await db
          .prepare(
            "SELECT id FROM ws_jobs WHERE runner='docker' AND status='running' AND lease_until<?",
          )
          .bind(Date.now())
          .all()
      ).results;
      for (const job of expired) await removeContainer(`atlas-${job.id}`);
      await recoverJobs(db);
      if (!configuration)
        await db
          .prepare(
            "UPDATE ws_jobs SET status='failed',error='此服务未连接容器执行器。请连接后重试。',updated_at=? WHERE runner='docker' AND status='queued'",
          )
          .bind(Date.now())
          .run();
      if (configuration && active.size < 2) {
        const queued = (
          await db
            .prepare(
              "SELECT id FROM ws_jobs WHERE status='queued' AND runner='docker' ORDER BY created_at LIMIT ?",
            )
            .bind(2 - active.size)
            .all()
        ).results;
        for (const job of queued) execute(job.id).catch(() => {});
      }
    } finally {
      busy = false;
    }
  }
  const timer = setInterval(() => tick().catch(() => {}), 1000);
  tick().catch(() => {});
  return async () => {
    closed = true;
    clearInterval(timer);
    for (const stop of active.values()) stop();
    while (active.size) await new Promise((resolve) => setTimeout(resolve, 50));
  };
}
