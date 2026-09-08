# 知图 · Knowledge Atlas

围绕真实问题持续探索的服务：人与 Agent 一起解释、验证、创建成果，并把发现沉淀为可维护的知识。

[产品初衷](PRODUCT.md) · [完整服务与知识设计](docs/EXPLORATION_SERVICE.md) · [当前架构](ARCHITECTURE.md) · [学习方法调研](docs/LEARNING_METHODS.md) · [Agent 知识审阅](docs/KNOWLEDGE_REVIEW.md)

## 运行

需要 Node.js 22.13+。

```bash
npm ci
npm run check
npm run serve
```

打开 <http://localhost:8080> 或 <http://localhost:8080/explore/>。桌面对话与成果并排，手机切换单列。

若本机 Docker 正在运行，且已存在 `python:3.13-alpine`，本地服务会提供受限 Python 实验。不会自动拉取镜像或修改 Docker 设置。在线模型与实时语音模型尚未接入，任务会明确显示等待配置。

## 已经可以完成的闭环

提出问题并保存探索 → 分享给本站访问者共同加入 → 自由讨论、编辑笔记或 HTML 面板 → 调整内置模型或实际运行 Python → 保留每次输入与结果 → 从选定笔记版本沉淀知识 → 修改正文、依据、边界与关系 → 导出或以后回来继续。

文本无需套固定教学格式。语音由浏览器转写后确认发送，支持逐条朗读和文字回退。私人偏好保存显式目标、兴趣和希望获得的帮助，不推断固定学习类型。原有九个种子知识、六条导学和证据实验仍可用。

## 数据与维护

```text
server/                服务 API、SQL 适配、任务与 Docker 执行
site/                  工作区、知识阅读与已有教学资源
db/ + drizzle/         数据结构与追加式迁移
content/learning/      方法、来源与预写导学
content/knowledge/     既有种子知识；新知识正文由服务保存
docs/                  产品、方法与知识维护决策
.data/atlas.sqlite     本地权威状态，不进入源码与发布包
```

本地使用 SQLite 和 HttpOnly Cookie；清除访问凭据无法自动找回旧记录。Sites 工作区使用可信网关提供的账号 ID（可用时）和 D1；旧版笔记仍保留原有凭据归属。平台账号和访客记录尚未自动合并。空间共享与站点整体访问权限分别控制。

知识导出的 JSON 可以恢复为 Agent 易于阅读的目录：

```bash
npm run export:knowledge -- /path/to/knowledge.json /path/to/export
```

生成 `knowledge/<id>/index.md`、元数据与允许访问的历史修订，不覆盖已有目录。SQL 是服务权威；导出目录是工作副本，不与数据库形成双重写入源。

维护 Agent 读取方法调研，判断哪些方法适用并说明理由。程序仅约束身份、权限、版本、引用与可执行边界。结构检查、内容审阅与真人试学独立记录。

```bash
npm run check
ATLAS_TEST_DOCKER=1 node --test tests/workspace.test.mjs
npm run db:generate
```

原有种子内容的 `scaffold:knowledge`、`publish:knowledge` 和 `apply:revision` 继续兼容，新增服务知识优先由工作区整理。不要编辑 `dist/`。

## 当前边界

尚未接在线模型、自主知识维护调度、生产云容器、实时语音模型或对象存储。当前容器执行是本地适配；托管服务需要独立执行能力。语音、软键盘和移动端布局仍需真机验证。既有导学尚未完成真实学习者试学。

GitHub Pages 只读静态导出不能承载完整产品；探索、共建和用户记录需要 Node 服务或 Sites Worker。构建不会清理 `.data`。备份与生产恢复策略见服务设计文档。

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
