# 知图 · Knowledge Atlas

从问题出发，逐步理解、实践验证、自由探讨与共同完善知识的开放学习平台。

产品初衷与边界见 [PRODUCT.md](PRODUCT.md)，实现见 [ARCHITECTURE.md](ARCHITECTURE.md)。教育与站点调研不是一次性的设计参考，它们已经进入 [知识引入检查规范](docs/KNOWLEDGE_REVIEW.md)、内容契约和持续校验。

## 运行

需要 **Node.js 22.13+**（本地服务使用内置 SQLite）。

```bash
npm ci
npm run check
npm run serve
```

打开 <http://localhost:8080>。

## 可以做什么

- 发现问题与三个主题路径，六条包含预测、提示、三层解释、迁移反馈与反思的导学。
- 九个知识百科条目：直觉、例子、正式陈述、假设、边界、来源和修订提案。
- 并行瓶颈与因果混杂模型，以及原有规则驱动的 Agent 证据实验。
- 发布关联讨论与回复，查看/比较/导出修订提案；维护者审阅后合入正文。
- 保存私人作答、安排重访、导出档案；保存多次独立实验快照并恢复条件。
- 查看学习方法、研究依据与新增知识的结构/人工检查表。

新导学尚未完成真实学习者试学。AI 功能当前为编辑引导与可复制的协作材料，未接入在线模型。

## 内容与维护

```text
content/learning/      问题导学、科普解释、学习方法和调研
content/knowledge/     知识正文与来源
content/cases/         可执行实验
site/                  页面、组件、交互与实验引擎
server/                共享 API、本地适配、Worker
db/schema.ts           数据库结构
drizzle/               版本化数据库迁移
docs/                  方法调研、知识引入与人工审阅规范
scripts/               构建、校验、内容维护
tests/                 学习契约、模型与数据隔离测试
dist/client/           生成的公共页面与资源
dist/server/           生成的 Worker
.data/                 本地数据库，不提交；构建不会删除
```

```bash
npm run validate:learning
npm run scaffold:knowledge -- my-concept
npm run publish:knowledge -- my-concept
npm run apply:revision -- /path/to/reviewed-proposal.json
npm run db:generate
```

新增知识需提供配套科普解释与来源；完整导学需通过 [检查规范](docs/KNOWLEDGE_REVIEW.md)。不要手工编辑 `dist/` 或把源字段名写成面向学习者的产品文案。

## 数据与部署边界

Node 本地服务使用 `.data/atlas.sqlite`；Sites Worker 使用 D1。公共讨论与私人学习分开保存。匿名私人档案与 HttpOnly Cookie 访问凭据关联，暂无账号找回和跨设备同步，请导出备份。

GitHub Pages 只发布 `dist/client`，可阅读和运行客户端实验，但没有共享 API；需要 Node 服务或 Sites Worker 才能保存与共建。页面在服务不可用时会明确报错。

公开对象入口：`/data/registry.json`、`/data/agent-context.json`、`/data/learning.json`、`/llms.txt` 和 `/llms-full.txt`。保留知识的认知状态和边界，不混入私人作答、研究草稿或讨论数据库。

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
