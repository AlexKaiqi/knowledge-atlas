# 参与知图共建

小贡献可以从一个问题、反例、解释或实验记录开始。完整产品目标见 [PRODUCT.md](PRODUCT.md)。

- 网页用户：在探讨区提出问题，或在知识页比较原文与修订、说明理由和来源。提案公开保留，审阅后进入正文。
- 内容贡献者：阅读 [知识引入检查](docs/KNOWLEDGE_REVIEW.md)，补齐准确知识与科普解释。方法依据见 [调研](docs/LEARNING_METHODS.md)。
- 开发者：阅读 [ARCHITECTURE.md](ARCHITECTURE.md)，保持公共内容、私人学习、实验快照与待审提案的边界。

提交前运行 `npm run check`。结构通过不代表教学正确；保留人工审阅和试学记录。默认新导学状态为 `editorial-draft`，不虚构学习效果。

维护者审阅网页提案后可以导出 JSON，运行 `npm run apply:revision -- <file>`。工具核对基础版本与原文，保留修订理由与作者，更新版本。之后检查差异并发布；过期提案需要重新比较。

原有实验继续支持 `scaffold:case` 和 `promote:case`，但并非每个知识问题都需要 Agent。思想练习和直接解释也是有效内容形态。
