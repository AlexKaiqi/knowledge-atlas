# 产品与系统架构

产品目标见 [PRODUCT.md](PRODUCT.md)。核心边界是公共知识、公共协作与私人学习；Agent 执行环境是实践子系统。

```text
content/learning/questions.json ── 问题、导学、练习与迁移
content/learning/knowledge-guides.json ── 知识的直觉、例子与自查
content/knowledge/*.json ── 准确陈述、来源、假设与边界
content/learning/methods.json ── 方法、调研依据和检查表
             │
       结构校验 + 人工审阅
             │
site/pages + site/components ── 27 个可独立链接的页面
             │
      scripts/build.mjs
             ├─ dist/client：页面、交互、公开 JSON 与 LLM 语料
             └─ dist/server/index.js：Cloudflare Worker

site/assets/platform.js ── 学习 / 实验 / 共建交互
             │
         server/api.mjs
             ├─ 本地：server/local-db.mjs → .data/atlas.sqlite
             └─ 托管：Worker env.DB → D1
```

## 领域对象和扩展位置

| 对象 | 来源 | 边界 |
| --- | --- | --- |
| 问题与导学 | `content/learning/questions.json` | 不要求具有 Agent runtime；支持模型、真实实验和思想练习 |
| 知识正文 | `content/knowledge/` | 保留认知类型、来源、假设与非推论；版本需明确 |
| 科普解释 | `content/learning/knowledge-guides.json` | 直觉、例子与自查独立于通用陈述，也可提出修订 |
| 方法与检查项 | `content/learning/methods.json` | 研究证据、设计借鉴和项目政策分开记录 |
| 教学模型 | `site/runtime/core/learning-models.js` | 纯函数计算；参数、公式与假设可检查 |
| Agent 实验 | `content/cases/`、`site/runtime/` | Environment 持有事实/权限，Provider 选择动作 |
| 讨论 | `discussions` | 公共主题及一层回复，关联稳定内容 ID |
| 修订 | `revisions` | 提案与正文分离；比较基础版本与原文，维护者审阅合入 |
| 学习记录 | `notes` | 以访问凭据隔离；一个问题的当前作答与重访时间 |
| 实验观察 | `observations` | 每次保存生成独立 ID；只追加，参数改变不会改写旧观察 |

## API

`GET /api/session` 创建匿名访问凭据；随机 256 位 Cookie 设置 HttpOnly、SameSite=Lax，HTTPS 下使用 Secure。数据库仅保存凭据哈希。此模式无实名身份、跨设备同步或凭据恢复，页面明确说明并提供导出。

- `GET/POST /api/notes`：读取当前凭据的记录；问题更新当前作答，实验追加不可变快照。
- `GET/POST /api/discussions`：按关联目标读取/发布主题和回复。先取根主题再读回复，避免活跃回复挤掉主题。
- `GET/POST /api/revisions`：按目标读取/提交提案；校验版本、原文、字段、理由与证据。

写入限制内容长度、来源、关联目标及频率；使用预编译 SQL。用户文本仅作为文本呈现。共享 API 不返回私人 owner 标识。私密查询不缓存。

## 构建和运行

Node.js 22.13+。保留原有 npm 和静态生成能力，不因重做页面而引入 SPA 框架。`npm run check` 包含内容校验、业务测试、完整构建和内部链接检查。

`db/schema.ts` 定义数据库，`npm run db:generate` 生成 Drizzle 迁移；已上线迁移不得改写。Worker 不运行建表逻辑，Sites 在部署时应用迁移。本地启动时根据迁移账本应用 SQL。

`npm run serve` 仅绑定本机地址，公共文件来自 `dist/client`。SQLite 数据位于 `.data/`，构建清理 `dist/` 不会删除学习与贡献。该目录、凭据和环境文件不进入版本库或部署包。

GitHub Pages 输出改为 `dist/client`，保留阅读与客户端实验；它不运行 API。完整协作平台通过 Node 服务或带 D1 的 Worker 运行，静态环境下保存失败必须明确告知，不能伪装成功。

## 不变条件

1. 来源正文、教学解释和自由讨论不能混成同一认知状态。
2. 机器校验不能授予“内容正确”或“学习效果已验证”。
3. 新导学需通过 `learning-contract.mjs` 与 [人工检查](docs/KNOWLEDGE_REVIEW.md)。
4. 变更实验条件后必须重跑；原有 Agent runtime 的证据权限保持独立。
5. 实验快照可比较和恢复；私人作答不会因关联同一问题而互相可见。
6. 修订依据原文和版本；公开提案不直接覆盖正文。合入工具保留历史。
7. `dist/` 与 `.generated/` 可重新生成；不是内容或用户数据的来源。
8. `research/` 与 `formal/` 不自动进入公开网页或 LLM 语料。
