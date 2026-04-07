# DraftOrbit V2 产品规格（一次性替换）

## 1. 目标
- 产品从“多页面工作台”升级为“Chat-first 内容运营助手”。
- 用户仅需一句话意图，即可自动完成：Research → Hook → Outline → Draft → Humanize → Media → Publish。
- 默认人工确认发布，降低 X 账号风控风险。

## 2. 核心体验
- 主入口：`/chat`。
- 交互原则：选项优先，自由文本可选。
- 输出结果：短推 / 串推 / 文章（可带配图建议），并给出下一步动作。
- 推理展示：仅展示步骤摘要，不暴露完整内部推理细节。

## 3. 数据接入
- 支持三类知识源：
  - Obsidian Vault（路径接入）
  - 本地文件（md/txt/pdf/docx 路径）
  - URL 导入（X 链接/网页）
- 支持 X 账号学习与风格重建（Style DNA）。

## 4. 模型与成本策略
- Trial：关键步骤优先高阶模型（预算受控）。
- Paid：免费优先 → 低价兜底 → 质量升档。
- 统一记录：`modelUsed / routingTier / fallbackDepth / requestCostUsd / qualityScore / trialMode`。

## 5. 商业化
- 继续使用 USD 三档定价：Starter/Growth/Max = `$19/$49/$99`。
- Stripe 为唯一生产支付入口。
- 目标毛利：`>= 70%`。
