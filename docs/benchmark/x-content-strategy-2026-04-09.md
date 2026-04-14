# DraftOrbit X 内容策略蒸馏（2026-04-09）

## Summary
- 目的：把公开写作方法蒸馏成 DraftOrbit 内部内容策略层，用于提升 `tweet / thread / article` 的自然度、逻辑性与 X 平台适配度。
- 这不是第三方代码复用，也不是前端产品功能。
- 这份文档只记录：**为什么这样改生成链路**、**蒸馏了哪些规则**、**要规避哪些坏模式**。

## 公开来源
1. X Help Center — Articles 官方建议
   `https://help.x.com/en/using-x/articles`
2. LangChain social-media-agent
   `https://github.com/langchain-ai/social-media-agent`
3. Typefully content prompts gist
   `https://gist.github.com/linuz90/4ea9ca379369540b86094270539ae09a`

## 蒸馏后的通用规则
### 1. 先给判断，再给背景
- 不要先铺大道理。
- 第一段先回答：**这条内容最重要的判断是什么**。
- 开头需要承担停留价值，而不是解释任务背景。

### 2. 观点后面立刻给证据
- 证据可以是：
  - 一个真实例子
  - before / after
  - 一个反例
  - 一个具体动作
- 没有证据的“方法论句子”很容易像 AI 套话。

### 3. 每段只推进一个意思
- tweet：一个判断 + 一个例子 + 一个问题
- thread：每条只负责一个推进点
- article：每节只负责一个主题，不混三个层次

### 4. 结尾要驱动回复，不要廉价 CTA
- 避免：
  - “欢迎留言讨论”
  - “点赞关注”
  - “评论区见”
- 优先：
  - 带选择的问题
  - 带经验回忆的问题
  - 让用户做判断的问题

### 5. 默认不加 hashtag
- 只有用户明确要求或语义上确实必要时才保留。
- 长文正文默认不带 hashtag。

### 6. 风格优先级：效果 > 模仿
- 先保证：
  - 易读
  - 有判断
  - 有例子
  - 有回复驱动
- 再叠加个人风格。
- 历史样本只做内部参考，不让用户配置。

## 分体裁策略
### tweet
- 目标：停留、回复、转发
- 默认长度：约 220-250 字
- 结构：`判断 / 反差 -> 例子 / 证据 -> 问题型收尾`

### thread
- 目标：展开一个判断，不为拆而拆
- 默认 4-7 条
- 第 1 条负责：
  - 给判断
  - 给价值承诺
  - 让用户愿意继续读
- 最后一条负责收束或提问

### article
- 目标：写成真正的 X 长文，不写成 tweet 扩写版
- 格式：
  - 标题
  - 导语
  - 3-5 个小节
  - 结尾
- 每节至少要有：
  - 例子
  - 反例
  - before/after
  - 具体动作

## 本项目已知坏样本
以下都是本轮要被 hard fail 或回归测试命中的坏模式：
- `别再靠灵感写 目标`
- `别再靠灵感写 什么是skills`
- `用“围绕”拆解动作`
- `欢迎留言讨论`
- 把用户意图原样抄进正文标题或段落
- 随机尾巴 id
- 垃圾 hashtag

## 对应到实现的策略
### 内容策略层上下文
- `focus`
- `format`
- `growthGoal = native_engagement`
- `stylePriority = effect_first`
- `voice_summary`
- `high_performing_examples`
- `platformRules`
- `antiPatterns`

### 质量门控
- hard fail：
  - prompt 泄漏
  - meta 污染
  - 垃圾 hashtag
  - 随机尾巴
- soft score：
  - hook strength
  - specificity
  - evidence
  - conversationality
  - CTA naturalness
  - platform fit

## 非目标
- 不在前端暴露“爆款模式”或“引流模式”
- 不做运行时实时抓取 X 热门内容
- 不直接复制第三方仓库代码
