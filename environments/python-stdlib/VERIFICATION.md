# 环境验证记录

2026-09-08，由维护 Agent 实际执行。本记录验证环境入口与文件留存，不是知识或教学效果验收。

- 平台：`linux/arm64`，`Python 3.13.15`。
- 实际构建镜像 ID：`sha256:7e6554dfac69cf3f73515099986fd2e036d13a079f8bb0188ef26bb120e24147`；本地未发布镜像仓库。
- Dockerfile SHA-256：`71e9f3a7ba3e9d6d6f88a587ffc345bafdade75b6444e32c750fed81e1c1d7cb`。
- 示例结果 SHA-256：`494d750f2cb59b2a1f5de8bde57b02c6ce702a60ea26383d44a30dc35ce7648e`。

## 已执行

按 [README](README.md) 的固定基础镜像构建；默认运行输出 Python 版本，检查默认 UID 为 `1000`。

以宿主 UID/GID、无网络、只读根、资源限制及独立 bind mount 运行 Python 写出 `result.txt`。容器退出并移除后，宿主仍能读取原内容；第二个新容器只读挂载同一目录，读回完全相同内容。

额外启动真实的长时 Python 进程，确认容器处于 running 后用 `docker stop --time 1` 停止；其 `--rm` 实例已移除，先前文件仍在。停止/删除容器没有作为删除探索资产的方式。

本机详细记录保留于 Git 忽略的 `.local/verification/`；复查可重新执行 README 示例，每次使用新目录，不依赖这份本机工作副本。

## 未验收

Dev Container 配置只检查了 JSON 和相对路径，没有通过编辑器或 CLI 实际启动。未测试其他 CPU 架构、Pi/OpenCode 模型会话、命名卷数据库备份或云沙箱。文件留存与重新挂载不等于数据库备份恢复演练。
