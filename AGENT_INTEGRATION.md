# Agent 接入入口

2026-09-08 决策更新：使用现有开源 Agent，通过 Skill、配置与说明接入。本项目不实现全套 Agent，也不把服务端 Provider、模型 API、工具循环或云调度列为当前路线。

- 用户入口：[使用自己的 Agent](docs/AGENT_USAGE.md)，包含 Pi、OpenCode 的参考方法与验证边界。
- 共用 Skill：[knowledge-atlas](.agents/skills/knowledge-atlas/SKILL.md)，在完整 clone 中使用。
- 维护约定：[AGENTS.md](AGENTS.md)，环境与成果见 [探索资产维护](docs/EXPLORATION_ASSETS.md)。

构建仍提供 `data/registry.json`、`data/agent-context.json`、`llms.txt` 和 `llms-full.txt`，用于发现已公开的种子资料、方法和引用。这些是资料入口，不是模型服务；不包括 SQL 私人记录，也尚未收录新 Git 知识目录。

旧版在此建议的 `/api/atlas-agent` 和 server-side Agent Provider 属于已撤回的设计，没有对应的可用接口，不应继续据此实现。旧教学案例的 scripted provider 仍按 [RUNTIME.md](RUNTIME.md) 兼容运行，它不代表在线 Agent。
