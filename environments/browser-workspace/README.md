# 共同工作浏览器环境

用于按问题创建网页、交互实验和小工具。现成 AIO Sandbox 提供 Chrome、终端、文件与 MCP；Codex 使用自己的原生工具循环，人通过 browser-ui 操作同一浏览器。

实际镜像版本和运行参数以 [browser-workbench.mjs](../../server/browser-workbench.mjs) 为唯一维护位置，当前固定 AIO Sandbox 1.11.0 及镜像摘要。镜像准备、资源限制、认证和上游来源见[浏览器接入](../../docs/BROWSER_WORKSPACE.md)。这里不复制一套 Dockerfile 或 Agent 运行时。

进入：准备镜像并启动本地服务，在探索中描述要制作的工具。也可点击工作面板的「打开浏览器」。退出：停止当前任务，再暂停环境；离开网页仅断开画面，不清理文件。

Agent 将应用、依赖说明、启动命令和有价值的结果保存在容器 `/home/gem/workspace`。此目录映射到 `.local/workspaces/<数据库命名空间>/<探索 ID>/workspace/`。保留原版本再实质修改；暂停后从 README 恢复服务。Chrome 当前标签和 localStorage 不代替工作文件备份。

该实例不是自动共享的环境版本；可复用文件通过既有环境包、成果版本与审阅流程保存。不要把浏览器登录、连接密钥或整个私人目录公开。实例限制为本地 Docker，不宣称生产云隔离；最后实际验证见 [验收记录](../../docs/ACCEPTANCE.md)。
