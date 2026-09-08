# Codex 与共同工作浏览器

知图复用已有 Agent 和浏览器组件，让参与者围绕同一段探索一起工作。正文回复、工具状态与可操作网页同时呈现；用户不需要先理解项目文件、端口或容器。它是本地服务的可选能力，不改变 clone 后使用自己 Agent 的正式路径。

## 采用什么

- **Codex CLI 原生 app-server**：登录、模型、工具调用、流式事件和中断交给原生实现。知图使用 JSON-RPC stdio，没有另建模型 SDK 或工具循环。当前协议验收版本为 0.153.4。[官方协议](https://learn.chatgpt.com/docs/app-server)
- **@agent-infra/browser-ui 0.2.2**：Apache-2.0 Web Component，通过 CDP 显示真实 Chrome 并传递导航、鼠标和键盘操作。模型浏览器工具和面板连接同一个浏览器实例。[源码与许可](https://github.com/web-infra-dev/agent-browser-sdk/tree/main/packages/browser-ui)
- **AIO Sandbox 1.11.0**：现成容器提供 Chrome、终端、文件及聚合 MCP。固定镜像摘要，不在每次探索时自动拉取未知版本。[项目](https://github.com/agent-infra/sandbox)

Codex 桌面应用的内置浏览器没有公开的第三方嵌入接口，官方说明也没有把桌面浏览器提供给 CLI。因此这里采用原生 Agent 协议与独立的开源浏览器组件组合，不称为移植了整个 Codex 桌面应用。[官方浏览器说明](https://learn.chatgpt.com/docs/browser)

曾对照 Codex Gateway、CloudCLI、HAPI、OpenHands Agent Canvas 和 Harnss。选择依据是：可嵌入现有网页、人与模型操作同一页面、可持久保存工作文件、避免替换知识服务。完整替换客户端会扩大本项目范围；HTTP iframe 或截图预览本身也不足以证明共享浏览器操作。后续升级应重新检查对应版本，不把本次判断当成永久结论。

## 本地准备

需要已登录并使用文件认证的 Codex CLI、运行中的 Docker，以及下列镜像：

```sh
docker pull ghcr.io/agent-infra/sandbox:1.11.0@sha256:6328d7fd2f0ff0b4c147c3d05b3df1ce331f4a482eb6e550ecd64ed1fcf906e7
npm ci
npm run check
npm run serve
```

`ATLAS_CODEX_BIN` 可指定 CLI，`ATLAS_CODEX=off` 或 `ATLAS_BROWSER=off` 可分别关闭。可用性由本机检测决定，未安装镜像时仍能对话，面板明确显示未连接。当前认证使用原生 auth.json 的私有符号链接，桥接不解析凭据；Keychain-only 尚未支持。不能直接把本机订阅登录公开成多用户云端模型服务。

工作浏览器按探索划分实例；数据库路径形成独立命名空间，测试数据库不会复用用户的容器。同一数据库通过本地服务锁只允许一个 serve 进程；确认旧服务退出后才恢复。最多同时运行两个工作浏览器，每个限制 2 CPU、3 GiB 内存及 512 进程。暂停不删除文件；再次进入时让 Agent 按保存的启动说明恢复应用。

## 数据和资产

- SQL 保存问题、正式回复、任务状态与有界的公开过程快照。追加迁移 `0005_damp_ikaris.sql` 提供 progress 与 progress_version；不保存原始推理或 MCP 原始返回值。
- `.local/workspaces/<数据库命名空间>/<探索 ID>/workspace/` 保存应用代码、依赖说明与实验文件，映射到容器 `/home/gem/workspace`。
- 同级 `connection.json` 是私有控制材料，不挂载到容器，不进入构建、公开知识或导出包。
- 容器磁盘、Chrome 当前会话与工作文件不是同一类资产。浏览器刷新会重新连接；暂停后工作目录仍在，进程与网页会话不保证恢复。重要输入、代码、结果和启动步骤应保存到工作目录。
- 工作目录尚未自动导入 SQL 成果版本，也没有自动备份。需要分享和长期维护时，选取成果/环境文件走已有版本与审阅流程，保留来源；不得公开整个私人目录或浏览器登录状态。

备份需要同时保留 SQL 和有价值的 workspace 文件；恢复到新路径时数据库命名空间会变化，应明确迁移文件并创建新的连接材料。不要把 Docker commit 当成完整的可重建环境说明。运行条件与独立证据继续遵循[探索资产维护](EXPLORATION_ASSETS.md)。

## 权限与执行边界

本地服务仅绑定 loopback。浏览器 WebSocket 经过同源 Cookie/成员权限检查，定期复核；公开阅读者不能直接操作浏览器。服务端为每个环境生成 RSA 密钥，使用此发布版本实际支持的 RS256 JWT 访问 `/mcp` 与 `/cdp`；JWT、原始端口不下发到页面。[1.11.0 认证文档](https://raw.githubusercontent.com/agent-infra/sandbox/v1.11.0/website/docs/en/guide/basic/authentication.md)

Codex 子进程使用独立配置和空工作目录，关闭宿主 Shell、桌面工具、插件、宿主 Skills 和宿主 MCP；仅显式连接本次探索的远端 MCP。原生 code_mode_host 是工具调用所需的桥梁，不能因模型目录要求 code mode 而关闭。显式授权的环境 MCP 使用原生 approve 策略；auto 在 approval_policy=never 下可能直接阻断实际工具调用。不能仅凭工具清单出现就判定接通，必须验证真实模型调用。

AIO 采用上游 Chrome 所需的 seccomp=unconfined 本地配置，没有挂载宿主 Docker socket、数据库或模型凭据。该配置及镜像内部服务的完整可重建源码尚未作为生产多租户隔离审计完成。公开源码组件不等于整张镜像已完成供应链审计。当前不提供生产云沙箱承诺。

browser-ui 0.2.2 的 destroy 会关闭已管理标签；适配先使用公开 API 断开 CDP transport，再清理组件，避免重连或切探索丢失页面内存。外部浏览器工具完成后有防抖的画面重新连接，用户输入时延后；它不重新导航网页。手机补充触摸滚动和原生文字输入，但真实手指、软键盘和语音须单独验收。

回答中断通过原生 turn/interrupt，取消后的迟到回复/进度由租约拒绝。环境调用产生的后台进程还需停止对应容器；暂停环境与正在使用环境的任务要协调。测试这些行为时只能用独立数据库和命名空间，不能向用户探索写合成提问。

## 升级与验收

更换 CLI、浏览器组件或镜像时，至少验证：原生首段输出与工具状态、真实创建网页/启动/打开/点击、人操作后 Agent 读取同一页面、刷新恢复、不同探索隔离、暂停与任务取消、未授权访问拒绝、手机切换与输入可见性。协议 fake 测试不能替代真实模型与浏览器验收。

发布包只使用 browser-ui 自带浏览器 bundle，不调用其 Node/Puppeteer 下载与解压入口。依赖审计仍须记录传递依赖风险，不能用“未调用”代替升级维护。2026-09-08 的 npm audit 仍报告 9 项：browser-ui/puppeteer 的下载解压链 5 项 high，以及已有 Drizzle 工具链 4 项 moderate；不使用 audit --force 降级迁移工具。WebSocket 已固定修复后的 8.21.3。当前验证和未完成项统一记入 [task.md](../task.md) 与[验收记录](ACCEPTANCE.md)。
