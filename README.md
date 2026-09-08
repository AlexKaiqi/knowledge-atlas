# 知图 · Knowledge Atlas

知图是一个**从问题出发、人与 Agent 共同探索、长期共建知识的开放学习项目**。引导、逐步深入的科普、自由探讨与实践是核心；可复用的知识、实验和环境是持续积累的资产。

**项目负责组织知识与探索资产，通过 Skills 等薄入口接入已有 Agent。** 使用者可以 clone 仓库，在自己的 Agent 中直接工作；模型、会话、规划和调度由所选工具提供。知图不自研全套 Agent，也不要求先运行网页服务才能探索。

## 为什么做

- 从真实问题和已有经验出发，按需追问、举例、直接解释或深入机制。
- 允许未完成的想法、反例与原创实践，通过图解、代码和实验继续检验。
- 让后续参与者能接着工作：找到来源、条件、分歧、代码、环境与结果。
- 让用户容易开始：直接表达意图，借助已有 Agent 的交互与工具；手机、语音和成果面板仍是体验方向。

科学学习方法帮助选择引导方式，不是统一关卡。知识正文保持自由；完整性看它能否说明问题、解释、依据、范围与进一步检验的方向。目录与专题帮助浏览，稳定引用和有理由的关系帮助维护。初始工程案例不限制知识领域。

## 用自己的 Agent 开始

Clone 后在仓库根目录启动已有 Agent，让它读取 [.agents/skills/knowledge-atlas/SKILL.md](.agents/skills/knowledge-atlas/SKILL.md)，然后直接提出问题。只做仓库知识与独立探索，无需先安装网页依赖。

Codex CLI 已实际完成两次会话、Docker 实验和从文件接续；Pi、OpenCode 提供尚未实测的参考说明，共用同一份 Skill。网页支持选择材料交给自己的 Agent，再导入报告或交互页。见 [接入说明](docs/AGENT_USAGE.md) 与 [验收记录](docs/ACCEPTANCE.md)；本地网页使用原生 Codex app-server 流式回答，并通过开源浏览器组件操作独立工作环境；托管版本尚未接通。

```text
knowledge/             Git 自有的可共享知识，自由正文
explorations/          问题、过程、代码与值得保留的运行证据
environments/          可复用环境定义、运行入口与恢复说明
.agents/skills/        跨 Agent 的薄接入指引
content/learning/      学习方法、来源与已有导学
content/knowledge/     既有网页种子知识适配层
site/ + server/        已有网页阅读、协作和持久化服务
docs/                  方法、组织与维护决策
.local/                私人或本地工作文件，Git 忽略；需自行备份
```

新目录是正式维护入口，尚未批量迁移旧内容，也未自动纳入网页索引。先复用 [Python 标准库环境](environments/python-stdlib/README.md)，需要其他依赖时再增加环境。环境、输入、代码和输出保存到容器之外，运行实例可以重新建立；详见 [探索资产维护](docs/EXPLORATION_ASSETS.md)。

## 文档入口

| 要了解什么 | 从哪里开始 |
| --- | --- |
| 初衷、产品体验与责任边界 | [PRODUCT.md](PRODUCT.md) |
| 当前路线、完成情况与验收 | [task.md](task.md) |
| Agent 接手与修改约定 | [AGENTS.md](AGENTS.md) |
| 本地流式 Codex 与共同浏览器 | [浏览器接入与维护](docs/BROWSER_WORKSPACE.md) |
| 使用自己的 Agent | [接入说明](docs/AGENT_USAGE.md) |
| 环境、运行结果、数据备份如何维护 | [探索资产维护](docs/EXPLORATION_ASSETS.md) |
| 知识组织与现有服务如何衔接 | [探索与协作设计](docs/EXPLORATION_SERVICE.md) · [ARCHITECTURE.md](ARCHITECTURE.md) |
| 方法来源及知识审阅 | [方法调研](docs/LEARNING_METHODS.md) · [知识审阅规范](docs/KNOWLEDGE_REVIEW.md) |

## 可选的网页服务

现有服务保存探索、共同讨论、笔记/HTML 成果版本、知识修订和显式学习偏好；提供内置模型与本地短时 Docker 执行。本地服务会检测已安装并登录的 Codex CLI，发送问题后自动调用，真实回复保存在讨论中，行动说明和工具状态逐步显示；工作面板可连接同一 Chrome，让人和 Codex 一起操作网页。旧问题可点「请 AI 回答」。`waiting_provider` 仅为旧的手工待办兼容状态。

需要 Node.js 22.13+：

```sh
npm ci
npm run check
npm run serve
```

打开 <http://localhost:8080/explore/>。网页按「我的探索、一起探讨、知识库、动手实践」组织在同一个工作区；读知识、选择实验后可回到原问题，保留未发送草稿。共同讨论支持列表浏览、加入与明确发布，知识保留正文与修订入口。见 [产品场景](docs/PRODUCT_SCENARIOS.md)。桌面对话与成果并排，手机单列切换。Enter 发送，Shift+Enter 换行；文字/语音模式记住此设备的选择，语音模式使用大按钮，停止后编辑确认。桌面语音快捷键为 Cmd/Ctrl+Shift+Space。语音识别仍依赖浏览器，真机录音和软键盘尚待验收。所选外部 Agent 的成熟客户端可承担自然语言、语音和远程工作体验，不另造一套模型服务。

Codex 沿用本机已有登录，优先使用 `codex`，macOS 可检测桌面应用自带 CLI；也可设置 `ATLAS_CODEX_BIN` 指定路径，`ATLAS_CODEX=off` 关闭。本地桥接只提供当前探索有限上下文及 Skill 对话指导，保持宿主最小只读，只向 Codex 开放本次探索独立环境的 MCP。浏览器采用 browser-ui，环境采用固定版本 AIO Sandbox；准备步骤、资产目录和边界见 [浏览器接入](docs/BROWSER_WORKSPACE.md)。它不用于将本机登录开放成公共模型服务。

实践页支持从需求新建环境、编辑或导入文件、独立分享和参与共建、派生新环境，并将所选版本冻结到探索中。环境包可以交给已有 Agent 构建与检验，再导回原环境保存新版本；保存定义不代表容器已经运行。

本机 Docker 正在运行且已存在 `python:3.13-alpine` 时，网页可进行受限 Python 实验。此执行器与仓库的可复用环境入口分别使用，不会自动保存完整开发工作目录，也不会自动拉取镜像。

## 数据与维护

Git 自有内容在仓库修订；服务讨论、正文修订、成果和私人记录以 SQLite/D1 为权威。两者没有自动双向同步。服务知识导出后是有来源的工作副本，改文件不会覆盖数据库；明确整理为共享的派生条目时保留来源和对应版本。

```sh
npm run export:knowledge -- /path/to/knowledge.json /path/to/export
```

导出还原为 `knowledge/<id>/index.md`、元数据与允许访问的修订，拒绝覆盖已有目录。私人导出放仓库外或 `.local/exports/`，不要直接提交。服务的本地数据库在 `.data/atlas.sqlite`，构建不会清理；Cookie 清除后的账号恢复、跨设备身份与生产备份仍有待完善。Sites 工作区使用可信网关提供的账号 ID（可用时）和 D1，旧版笔记身份不自动合并。

修改应用、知识或实验后运行 `npm run check`；修改网页 Docker 执行器时再运行 `ATLAS_TEST_DOCKER=1 node --test tests/workspace.test.mjs`。仅改说明文档核对事实、链接和差异。不要编辑 `dist/`，数据库使用追加式迁移。旧种子内容脚本继续兼容，不能代表修改了 SQL 服务正文。

“clone → 自己的 Codex → Docker → 保留证据 → 新会话接续 → 网页成果”已用一个条件模型验收；下一步扩展真实问题、真机体验和有状态资产恢复。不再建设自有 Agent Provider、模型循环、云调度或全套语音服务。新版网页仍仅本地实现，未更新线上；静态发布只能提供阅读，在线协作需要服务。

## Research: allocation and attention allocation

There are [two independent research projects](./research/README.md), not static and
dynamic chapters of one project. Each maintains its own problem, roadmap, models,
claims, verification evidence, literature, paper planning, and philosophical discussion.

Start with:

- [Allocation with known demands](./research/possibility-allocation/README.md)
- [Attention allocation with demand prediction](./research/attention-allocation/README.md)

The independent [Lean 4 project](./formal/README.md) remains in `formal/`.
It contains conditional KL, Bellman, and routing proofs, not a proof that the
research questions uniquely select those models. Exact scope and version-specific
verification status are recorded separately for [allocation](./research/possibility-allocation/verification/README.md)
and [attention allocation](./research/attention-allocation/verification/README.md).

```bash
cd formal
lake build
```


原有 Agent 实验契约见 [RUNTIME.md](RUNTIME.md) 与 [AGENT_INTEGRATION.md](AGENT_INTEGRATION.md)。
