import { shell } from "../components/html.mjs";
import { head } from "../components/learning.mjs";

export function renderWithAgent() {
  return shell({
    title: "用自己的 Agent 继续 · 知图",
    root: "../",
    active: "agent",
    body: `<div class="page">${head("CONTINUE EXPLORING", "带上你的问题，用自己的 Agent 继续。", "知图保存问题、知识与探索成果。你熟悉的 Agent 负责查证、编写工具和运行实验。")}
      <section class="panel"><h2>直接在网页里提问</h2><p>工作区显示「Codex 已连接」时，直接发送问题就会得到回答，也可以接着追问。文字与语音模式可以切换并记住选择；语音停止后先确认文字。</p><p>需要运行工具或独立实验时，再把所需材料交给自己的完整 Agent。</p><h2>把探索带到自己的 Agent</h2><ol><li>回到探索，选择「交给自己的 Agent」，写下下一步，勾选要附上的讨论或成果。</li><li>预览后复制或下载接续材料，在自己的 Agent 中打开。</li><li>Agent 生成的笔记或交互页面，可以在原探索的「带回 Agent 成果」中选择文件，检查后保存。</li></ol><p>接续材料保存在本机，由你选择交给哪个工具。只有你选中的版本会被带走；完整历史可另存 JSON 备份。</p><a class="button primary" href="../explore/">打开探索工作区</a></section>
      <section class="panel section"><h2>在自己的项目目录直接探索</h2><p>Clone 项目并进入包含 <code>.agents/skills/knowledge-atlas/SKILL.md</code> 的版本，启动已登录的 Codex CLI、Pi 或 OpenCode。仅整理知识和独立实验无需启动本站服务。</p><p>可以直接对 Codex 说：</p><pre><code>$knowledge-atlas 从我的问题开始，复用已有环境，
实际运行并保存结果，让下一次能够从文件继续。</code></pre><p>也可以把从网页下载的 Markdown 材料交给它，要求先读取项目 Skill，再继续探索。模型账号由你已有的工具管理，本地网页通过 Codex CLI 回答，不另建模型服务。</p><a class="button" href="https://github.com/AlexKaiqi/knowledge-atlas" target="_blank" rel="noreferrer">打开项目仓库 ↗</a></section>
      <section class="panel section"><h2>把探索留下来</h2><p>知识放在 <code>knowledge/</code>，问题、代码和重要运行记录放在 <code>explorations/</code>，复用 <code>environments/</code> 的环境定义。正文格式自由，来源、条件和实际结果应当能找到。</p><p>Python 环境与运行说明位于仓库的 <code>environments/python-stdlib/</code>。Agent 在得到所需执行权限后调用 Docker；容器可以重建，代码、数据与结果保存到容器之外。更详细的接入和资产维护约定见仓库 README。</p></section>
    </div>`,
  });
}
