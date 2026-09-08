# 服务架构

产品与知识决策详见 [持续探索服务设计](docs/EXPLORATION_SERVICE.md)。此处记录当前运行路径，避免把未来接口说成已连接能力。

## 运行路径

```text
site/pages/workspace.mjs + site/assets/workspace.{js,css}
  → /api/workspace/*
  → server/api.mjs（来源检查、大小限制、访问凭据）
  → server/workspace.mjs（探索、成员、消息、成果、知识与偏好）
  → SQLite / D1 原子 batch
  → server/jobs.mjs（领取、租约、完成、取消、中断恢复）
  → server/docker-runner.mjs（仅本地受限执行）
```

主界面位于 `/` 与 `/explore/`，旧关系图移到 `/map/`。预写导学、初始百科和原有实验仍提供可选入口。主体浏览与动态服务分离，模型接入不需要替换数据底座。

## 模块边界

- `server/api.mjs`：旧笔记、讨论、修订 API 保持兼容；工作区入口共享请求约束。
- `server/workspace.mjs`：身份、共享、共同加入、自由消息、产物版本、知识修订与私人偏好。
- `server/jobs.mjs`：纯模型运行、租约条件写回与恢复；没有在线模型时任务明确等待配置。
- `server/docker-runner.mjs`：Python 镜像摘要、非 root/网络/资源约束、超时、取消、产物保存。
- `server/local-db.mjs`：Node SQLite，与 D1 一致的 prepared statements 和事务 batch。
- `server/worker.mjs`：只在 Sites 网关适配稳定账号；云端不自动启用本地 Docker。
- `db/schema.ts`、`drizzle/`：追加式迁移；已应用迁移不可重写。
- `site/assets/workspace.js`：独立桌面/手机工作区、草稿、版本冲突处理、语音适配与隔离预览。
- `content/learning/methods.json`：学习方法及来源的维护依据；不是通用页面 schema。

## 数据与权限

`ws_*` 表承载新服务；原 `discussions/revisions/notes/observations` 保留既有记录。新旧身份暂不自动合并。业务操作从已授权空间或知识对象进入，不用昵称或前端角色授权。

探索共享面向本站访问者。加入时原子检查共享状态；改回私人后已加入成员保留权限。知识从选定笔记版本复制，默认私人；知识非所有者只能读明确共享的修订，私人历史与隐私来源不随发布泄露。输入来源和关系在服务端校验。

知识正文采用自由 Markdown。修订以基础版本和不可变版本键防止覆盖。幂等请求绑定 actor、路径和完整内容摘要，相同请求重放原响应；真正重试生成新 ID。批处理任一步失败全部回滚。

## 执行与部署

本地 `npm run serve` 仅绑定 127.0.0.1、校验 Host。数据在 `.data/atlas.sqlite`，构建不会清理。检测到已有 `python:3.13-alpine` 才启用 Docker。服务本地调度上限两个同时运行的容器；每次运行限制 20 秒和 24 KB 输出，结果不依赖容器磁盘。

Sites 产物为 `dist/server/index.js`、`dist/client/` 和迁移，D1 为数据库。大型文件/R2、持续云任务队列、云容器和在线模型未配置。托管服务访问时会有界恢复内置任务和失效租约；这不等于持续云 Agent。

GitHub Pages 只是只读静态输出，不提供探索持久化。核心产品必须运行服务，不应再以静态导出作为完整产品交付。

## 验证

`npm run check` 验证内容协议、原有模型、权限/版本/分享/恢复、静态构建与链接。`ATLAS_TEST_DOCKER=1 node --test tests/workspace.test.mjs` 使用独立临时数据库验证真实容器输出及重启后恢复，不往用户探索写测试数据。浏览器真机语音、布局与键盘测试尚未执行。
