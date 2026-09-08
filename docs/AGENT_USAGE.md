# 使用自己的 Agent

决策日期：2026-09-08。知图维护知识、方法、探索资产和接入约定；模型选择、登录、会话、规划、工具执行和调度由使用者选择的 Agent 负责。仓库不安装 Agent，不代理模型凭据，也不实现另一套 Agent 循环。

## Clone 后开始

在仓库根目录启动自己已有的 Agent，请它读取 [knowledge-atlas Skill](../.agents/skills/knowledge-atlas/SKILL.md)。只整理知识、运行独立实验时，无需启动网页服务或安装 Node 依赖。

可以直接说：

> 加载 knowledge-atlas skill。从我关心的问题开始，先看看已有材料；需要实验时复用环境。把值得保留的过程和结果留在仓库，让下一次可以继续。

可共享知识放在 [knowledge/](../knowledge/README.md)，开放探索放在 [explorations/](../explorations/README.md)，环境定义放在 [environments/](../environments/README.md)。私人草稿、原始会话、临时输出先放 Git 忽略的 `.local/` 或仓库外；忽略规则并不等于备份或加密。Agent 接手靠问题、已有结论、运行入口和下一步，不依赖某个聊天产品的隐藏会话。

## 只维护一份 Skill

```text
.agents/skills/knowledge-atlas/SKILL.md
```

采用标准 `name`、`description` 和自由 Markdown 正文；正文导航到本项目的规范，不复制一套产品规则。它依赖完整仓库，不能单独拷到全局目录后宣称仍然可用。[Agent Skills 规范](https://agentskills.io/specification)

Codex CLI 已完成两次真实会话验收，Pi 与 OpenCode 保留为尚未实测的参考入口；它们复用同一份 Skill。本地网页可通过现有 Codex CLI 直接回答，托管服务尚未接通。完整验证边界见 [CLI 与产品验收](ACCEPTANCE.md)。

### Codex CLI

先在自己的环境确认 `codex --version` 与 `codex login status`，从仓库根目录启动 `codex`，在会话中输入：

```text
$knowledge-atlas 从我的问题开始，检查已有资料与环境，实际运行后留下可接续的记录。
```

Codex 原生发现 `.agents/skills/`，也可以直接要求读取完整路径。本项目不添加模型 SDK 或代理登录。[Codex Skills](https://learn.chatgpt.com/docs/build-skills)

重复验收可使用原生非交互入口。先将任务写在 `.local/prompt.md`，明确允许修改的探索目录和实际运行要求：

```sh
codex exec --sandbox workspace-write --json \
  --output-last-message .local/last-message.md - < .local/prompt.md
```

第二次重新执行，要求读取已有探索及新的条件；不要把上一段聊天作为唯一上下文。保留事件日志时先放 `.local/`，检查后才整理可共享证据。[Codex 非交互模式](https://learn.chatgpt.com/docs/non-interactive-mode)

`workspace-write` 不保证能访问 Docker socket。本次 0.153.4 验收先真实遇到拒绝；第二次按 Codex 权限配置显式允许本机 Docker socket，仍保留工作区文件限制，才完成容器运行。只添加 socket 所在目录的 `--add-dir` 不够，`exec --allow-unix-socket` 在该版本也不是可用参数。具体配置由使用者的版本与环境决定，不提交个人 socket 路径或放宽全局权限。Docker socket 本身允许控制宿主 Docker，不能视作只开放一个容器的细粒度权限。[Codex 权限](https://learn.chatgpt.com/docs/permissions)

### Pi

在已安装、配置好 Pi 的环境中，从仓库根目录启动：

```sh
pi --skill ./.agents/skills/knowledge-atlas/SKILL.md
```

`--skill` 明确注册来源；会话内可用 `/skill:knowledge-atlas 你的问题` 显式加载。已自动发现时直接启动 `pi` 即可。保留 Pi 自身的项目信任与授权机制，不把不明来源的仓库内容当作可信指令。[Pi Skills](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md) · [Pi 使用说明](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md)

### OpenCode

在仓库中启动已有的 `opencode`，直接要求“加载 knowledge-atlas skill，然后……”。Agent 通过 OpenCode 原生 `skill` 工具读取内容；无需复制到另一个专属目录。Pi 的 `/skill:` 命令不作为 OpenCode 的通用命令。[OpenCode Skills](https://opencode.ai/docs/skills/)

其他 Agent 若没有自动发现能力，可以显式读取同一个文件。其权限、联网、上下文容量和执行环境仍以自身能力为准。

## 接入保持多薄

Skill 帮助 Agent 找到资料、选择现有环境、保存可复查结果、审阅知识与留下交接；不包含模型 SDK、聊天数据库、凭据代理、持久任务队列或云沙箱控制器。功能确实需要某个工具时，优先使用该 Agent 已有的能力及原生命令。

长期任务可运行在使用者已有的远程主机或开源 Agent 服务中，同样读取仓库与资产定义。知图本身不承诺关闭网页后的 Agent 调度。手机与语音优先借用所选工具的成熟客户端；本项目保留轻量阅读、成果和协作入口，后续有具体需求再做薄连接。

## 与网页协作

在网页选择「交给自己的 Agent」，写下一步，只勾选需要的讨论或成果版本，预览后复制或下载 Markdown 材料。默认不附整段讨论或私人偏好；所选版本包含它自己的运行条件。完整 JSON 历史备份另行选择。若浏览器未保存下载文件，可复制预览内容。

Agent 返回的 `.md`、`.txt` 或自包含 `.html` 文件，可以在原探索「带回 Agent 成果」中选择；文件先填入表单，检查后才保存。修改已有成果时使用「修改成果」，保留基础版本及修改理由。当前正文最多 24000 字符、文件最多 40000 字节；较大代码、数据和日志仍作为仓库资产保存。

环境通过实践页创建、共同编辑与派生，单独分享所选版本。「交给自己的 Agent」复制用途与完整文本文件，或下载 JSON 环境包；Agent 在新的目录检验并补齐文件，保留 `source.id/version` 返回同格式包。在原环境「编辑与导入」中先预览再保存新版本，遇到较新的共同修改先比较合并。没有现成 Agent 或 Docker 时仍可创建、编辑和共建草稿；页面不会假称容器已经运行。具体边界与格式见 [环境共建](EXPLORATION_ASSETS.md#在网页创建与共建环境)。

Git 自有内容直接在仓库修订；网页服务中的私人记录仍由 SQLite/D1 管理。当前没有外部 Agent 专用服务身份，也没有 Git 与数据库双向同步。不得让外部 Agent 冒充用户 Header 或直接修改生产数据库。

需要复用服务知识时，由有权限的用户导出明确选定的版本，在 `.local/exports/` 或仓库外检查，再把允许共享的部分整理为 Git 自有条目，记录来源与分支关系。改导出副本不会更新服务正文。若回写服务，由拥有权限的使用者按基础版本比较并提交；这是明确的修订，不是自动覆盖。

## 验收一条接入

用选定 Agent 在全新 clone 中完成一次真实探索：加载 Skill、找到资料、运行一个环境、解释实际结果并留下可接续的文件；第二个会话从这些文件继续。分别记录 Agent/版本、已调用工具、未能执行的步骤和文件变化。格式校验通过不能替代这个验收。

## 网页直接提问

运行 `npm run serve` 时，本地服务会检测已安装且已登录的 Codex CLI。可设置 `ATLAS_CODEX_BIN` 指定可执行文件，或 `ATLAS_CODEX=off` 关闭；修改后重启服务。页面显示「Codex 已连接」后，直接发送问题即可得到讨论回复，后续消息会带上同一探索的有限历史。之前保存的未答问题可以点「请 AI 回答」。

桥接使用 Codex 原生 app-server，仅传当前对话和 [Skill 对话指导](../.agents/skills/knowledge-atlas/references/conversation.md)。原生消息片段和工具过程通过 SSE 呈现。工作面板复用 browser-ui 与 AIO Sandbox，人和 Codex 操作同一 Chrome；本机文件仍保持最小只读，写入与执行通过远端环境的显式 MCP。准备镜像、资产位置与接入限制见 [浏览器接入](BROWSER_WORKSPACE.md)。后台取消、有限超时及结果保存复用已有服务；不另造模型循环。

输入默认 Enter 发送、Shift+Enter 换行，并保护输入法组合状态。文字/语音模式记住当前设备的选择；语音需主动开始，停止后先确认文字。桌面用 Cmd/Ctrl+Shift+Space 开始或停止转写。页面刷新不自动开麦克风。识别效果取决于浏览器能力，未把代码测试当成真机录音验收。
