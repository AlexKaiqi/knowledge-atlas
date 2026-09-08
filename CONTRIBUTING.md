# 参与知图共建

从一个问题、反例、解释或实验记录开始。产品目标见 [PRODUCT.md](PRODUCT.md)，当前路线见 [task.md](task.md)。

- 用自己的 Agent：clone 后读取 [.agents/skills/knowledge-atlas/SKILL.md](.agents/skills/knowledge-atlas/SKILL.md)，按 [接入说明](docs/AGENT_USAGE.md) 工作，不要求启动网站。
- 整理知识：在 `knowledge/` 维护 Git 自有正文；阅读 [知识审阅规范](docs/KNOWLEDGE_REVIEW.md) 与 [方法调研](docs/LEARNING_METHODS.md)，说明适用性与依据，格式自由。
- 分享实践：在 `explorations/` 保留问题、条件、代码、结果和下一步，复用 `environments/`。环境与数据维护见 [探索资产维护](docs/EXPLORATION_ASSETS.md)。
- 网页参与：在工作区共同讨论、维护成果或知识修订，按明确权限分享；旧知识页提案需审阅合入后才改变正文。
- 修改应用：阅读 [AGENTS.md](AGENTS.md) 与 [ARCHITECTURE.md](ARCHITECTURE.md)，保持公共资料、私人记录与版本边界。

Git 中只保存有权共享的内容，私人导出和本地工作先放 `.local/` 或仓库外。服务 SQL 与 Git 没有自动双向同步；改副本不回写数据库，也不要让源条目与派生条目混称同一版本。

新增或修改知识、实验、导学与应用行为运行 `npm run check`，环境还需验证实际运行与数据留存。仅改说明文档核对事实、链接及 `git diff --check`。结构检查、编辑自查、独立审阅和真人试学分别记录，不虚构通过。

旧种子内容继续兼容 `scaffold:knowledge`、`publish:knowledge`、`apply:revision`；后者处理旧网页导出的种子修订，核对基础版本并保留作者理由，不能用于覆盖新 SQL 知识。原有教学案例继续支持 `scaffold:case` 和 `promote:case`。这些不是自由知识必须经过的流程。
