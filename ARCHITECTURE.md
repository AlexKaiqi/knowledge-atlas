# 项目组织与服务架构

项目优先组织知识与探索资产，通过 Skills 接入已有 Agent，不自研运行时、模型循环或云调度。详细边界见 [探索与协作设计](docs/EXPLORATION_SERVICE.md)。

## 仓库入口

```text
用户选择的 Agent（外部工具，自行配置模型和会话）
  → .agents/skills/knowledge-atlas/SKILL.md
  → knowledge/（Git 自有知识）与 explorations/（探索与运行证据）
  → environments/（环境定义、可选 Dev Container / Compose）
  → 原生 Docker 或本地语言环境，输出保存在容器外
```

仓库使用不依赖网页服务。Git 自有内容通过文件和版本历史维护；服务数据仍由 SQL 管理。新目录暂未接入网页索引，没有自动双向同步。服务导出放 `.local/exports/` 或仓库外，明确整理为派生条目时记录来源/版本与分享范围，不覆盖原记录。

网页的 `/with-agent/` 提供使用入口；`site/assets/agent-handoff.js` 生成用户选择的版本材料，不代理模型或回写数据库。文件导入复用既有成果修订接口，先检查后保存；Markdown 经过转义渲染，HTML 在隔离 iframe 中运行。

接入见 [使用自己的 Agent](docs/AGENT_USAGE.md)，资产与备份见 [探索资产维护](docs/EXPLORATION_ASSETS.md)。`RUNTIME.md` 仅描述旧教学案例兼容契约。

## 已有网页运行路径

```text
site/pages/workspace.mjs + site/assets/workspace.{js,css}
  → /api/workspace/*
  → server/api.mjs（来源检查、大小限制、访问凭据）
  → server/workspace.mjs（探索、成员、消息、成果、知识与偏好）
  → SQLite / D1 原子 batch
  → server/jobs.mjs（领取、租约、完成、取消、中断恢复）
  → server/docker-runner.mjs（仅本地受限执行）
```

主界面位于 `/` 与 `/explore/`，旧关系图移到 `/map/`。预写导学、初始百科和原有实验仍提供可选入口。服务提供协作与记录；本地网页通过已有 Codex CLI 回答，托管 Worker 未配置此桥接；不自建模型循环。

## 模块边界

- `server/api.mjs`：旧笔记、讨论、修订 API 保持兼容；工作区入口共享请求约束。
- `server/workspace.mjs`：身份、共享、共同加入、自由消息、产物版本、知识修订与私人偏好。
- `server/jobs.mjs`：纯模型运行、租约条件写回与恢复；兼容 `waiting_provider` 状态表示已保存的 Agent 待办，没有后台推理。
- `server/docker-runner.mjs`：Python 镜像摘要、非 root/网络/资源约束、超时、取消、产物保存。
- `server/local-db.mjs`：Node SQLite，与 D1 一致的 prepared statements 和事务 batch。
- `server/worker.mjs`：只在 Sites 网关适配稳定账号；云端不自动启用本地 Docker。
- `db/schema.ts`、`drizzle/`：追加式迁移；已应用迁移不可重写。
- `site/assets/workspace.js`：独立桌面/手机工作区、草稿、版本冲突处理、语音适配与隔离预览。
- `content/learning/methods.json`：学习方法及来源的维护依据；不是通用页面 schema。

## 场景与知识阅读

`workspace-navigation.js` 负责可恢复的 URL 和引用表示；`workspace-scenes.js` 提供列表及实践目录；`public-knowledge.js` 只渲染公开种子正文；`knowledge-proposals.js` 沿用旧公开修订 API。`workspace.js` 控制场景与探索的独立状态、异步归属及服务知识编辑。未指定探索的默认首页是 mine；`s` 指向的已有对话和预置问题入口保持原路由。侧栏、对话内「新问题」与快捷键共用 `startQuestion()`，同步聚焦并清零首页滚动位置，不让迟到历史读取改变用户的输入位置。我的探索复用同一 composer DOM，以独立的首页草稿作用域保存新问题；其发送目标始终是新私人探索，URL 中保留的旧 `s` 只用于返回，不能作为该输入的写入目标。

`/`、`/explore/`、`/knowledge/`、`/knowledge/:id/` 和 `/practice/` 共用 `renderWorkspace`；旧知识/实践页面 renderer 是薄路由入口，不再维护另一套主界面。公开知识正文与有权限的 SQL 修订统一阅读，但数据源、版本和权限不合并。辅助导学、旧社区和实验观察页面保留。

共享创建由 `POST /spaces` 显式 `visibility: shared` 在事务内完成，省略时仍私人。可选 `title` 只控制列表的问题名称，引用与问题的完整消息独立保留。这项共享创建未修改数据库结构；环境资产的追加迁移见下文。场景约定见 [产品场景](docs/PRODUCT_SCENARIOS.md)。

## 数据与权限

`ws_*` 表承载新服务；原 `discussions/revisions/notes/observations` 保留既有记录。新旧身份暂不自动合并。业务操作从已授权空间或知识对象进入，不用昵称或前端角色授权。

探索共享面向本站访问者。加入时原子检查共享状态；改回私人后已加入成员保留权限。知识从选定笔记版本复制，默认私人；知识非所有者只能读明确共享的修订，私人历史与隐私来源不随发布泄露。输入来源和关系在服务端校验。

知识正文采用自由 Markdown。修订以基础版本和不可变版本键防止覆盖。幂等请求绑定 actor、路径和完整内容摘要，相同请求重放原响应；真正重试生成新 ID。批处理任一步失败全部回滚。

## 执行与部署

本地 `npm run serve` 仅绑定 127.0.0.1、校验 Host。数据在 `.data/atlas.sqlite`，构建不会清理。检测到已有 `python:3.13-alpine` 才启用 Docker。服务本地调度上限两个同时运行的容器；每次运行限制 20 秒和 24 KB 输出，结果不依赖容器磁盘。

Sites 产物为 `dist/server/index.js`、`dist/client/` 和迁移，D1 为数据库。大型文件/R2、持续云任务队列、云容器和在线模型未配置。托管服务访问时会有界恢复内置任务和失效租约；这不等于持续云 Agent。

GitHub Pages 是只读静态输出，不提供在线协作和私人记录。需要这些功能时运行 Node 服务或 Sites Worker；clone 后的知识与独立探索不要求运行服务。

## 验证

`npm run check` 验证内容协议、原有模型、权限/版本/分享/恢复、静态构建与链接。`ATLAS_TEST_DOCKER=1 node --test tests/workspace.test.mjs` 使用独立临时数据库验证真实容器输出及重启后恢复，不往用户探索写测试数据。桌面键盘、浏览器布局与 390/320 宽场景导航已实际验收；真机语音、软键盘和弱网仍未验收。

## 本地网页直接对话

`serve.mjs` 检测已登录的 Codex CLI，再启动薄桥接。消息与 `codex` 任务原子保存，已有问题通过显式补答入口进入同一路径。当前任务串行执行，领取时冻结该问题范围内的消息及前序回复；不带私人偏好或其他探索。

`codex-cli.mjs` 检测本机 CLI，`codex-app-server.mjs` 通过 stdio 驱动原生 app-server。每次使用独立配置与空工作目录，原生读取已有文件认证；关闭宿主 Shell、Skills、项目/桌面注入、插件和宿主 MCP，保留最小只读本机权限。仅传当前探索的远端 MCP 配置，原生执行工具循环；远端工作目录可写与本机只读分开说明。

`codex-progress.mjs` 只接受公开消息与工具状态，保存有界快照和单调版本，经 `/spaces/:id/events` SSE 推送。客户端合并快照，不用重复调用模型恢复连接。迁移 0005 追加进度字段；取消、过期租约拒绝迟到片段。`agent-live.js` 显示流式回答、工具过程与取消入口，完成正文出现前保留部分输出。

`browser-workbench.mjs` 将每段探索映射到 AIO Sandbox 容器和持久工作目录，复用上游 Chrome/终端/文件/MCP。`browser-proxy.mjs` 在 Cookie、同源与成员检查后代理 CDP，JWT 不进入前端。`browser-panel.js` 挂载 browser-ui；`browser-input.js` 补充触摸与原生文字输入。容器按数据库命名空间隔离，服务持独占 DB 锁。详细边界、备份和升级见 [浏览器接入](docs/BROWSER_WORKSPACE.md)。

`codex-jobs.mjs` 复用 45 秒租约并受条件续租；完成时把 `agent:codex` 消息及任务成功状态原子写回。超时、取消、停机和过期执行者不会补写迟到回答；重试保留原尝试，使用稳定 ID 防止重复调用。旧消息不会因 GET 或刷新而自动消耗调用。

桌面和手机输入逻辑在 `composer-input.js`：设备偏好与草稿使用浏览器存储，消息仍以 SQL 为权威。语音开始由点击或快捷键触发，停止后编辑确认，切换探索会停止识别，迟到回调不修改新探索。


## 环境共建服务

`server/environments.mjs` 复用 workspace 的服务端身份、访问检查、幂等和事务。迁移 `0004_grey_wolfpack.sql` 追加环境主体、不可变文件版本与共建成员三张表，保留现有记录。环境创建默认私人，创建者可分享当前版本；共享环境的参与者显式加入后按 baseVersion 修订，分享范围仍仅由创建者改变。读取同时检查当前环境范围与版本的 shared_at，不追溯公开私人历史。来源关系读取复核权限。

`site/assets/workspace-environments.js` 管理实践环境目录、版本阅读、表单草稿、加入/派生/分享、导入导出；`environment-package.js` 提供只含所选文件的可携带包。环境路由用 `env` 与可选 `ev`，与当前探索 `s` 独立。新建/编辑的迟到保存不能关闭另一个表单或删除新草稿。

`POST /environments/:id/use` 在目标探索保存文件快照与源版本，事务内复核读取和写入权限。私人环境快照只能进入私人探索；探索分享时还检查全部历史快照的明确公开许可，不能通过后来编辑成果绕过。已明确公开时复制的快照不会因来源撤回而消失。

包导入不执行文件，构建仍交已有 Agent 与原生 Docker 等工具；网页固定 Python runner 保持原边界；Codex 浏览器工作环境单独接现成 AIO，不会因导入环境包自动执行内容。起点由 build 从已维护的 Python Dockerfile 生成公开文件包；SQL 环境和私人数据不进入静态产物，无 Git/SQL 自动同步。
