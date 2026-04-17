# Baoyu Runtime Benchmark (2026-04-11_19-09-45)

- API: `http://127.0.0.1:4311`
- Evidence root: `/Users/yangshu/.codex/worktrees/draftorbit-visual-card-pipeline/artifacts/baoyu-runtime-benchmark/2026-04-11_19-09-45`
- Cases: `20`
- Pass count: `20/20`
- Full suite: `true`

## tweet-ai-cold-start · TWEET

- runtimePass: `true`
- primaryModel: `x-ai/grok-4.20-20260309`
- routingTier: `quality_fallback`
- runtime: `{"commit":"31b2929d1cc00b57dfd20571416ad2284145525f","engine":"baoyu-skills","skills":["baoyu-imagine"]}`
- visualAssets: `1`
- qualityGate: `{"status":"passed","hardFails":[],"judgeNotes":[],"safeToDisplay":true,"visualHardFails":[]}`
- average: `81`
- benchmarkPass: `true`

**Runtime hard fails**

- none

**Output**

```text
AI 产品冷启动最容易输，不是内容少，是第一句没给具体使用场景。 比如做周报助手，别先写“AI 写作平台”，直接写“贴一段口语，我帮你改成能发给老板的周报”，用户才知道第一步该怎么用。 如果现在只改第一句，你会先写哪个用户场景？
```

## tweet-product-update · TWEET

- runtimePass: `true`
- primaryModel: `x-ai/grok-4.20-20260309`
- routingTier: `quality_fallback`
- runtime: `{"commit":"31b2929d1cc00b57dfd20571416ad2284145525f","engine":"baoyu-skills","skills":["baoyu-imagine"]}`
- visualAssets: `1`
- qualityGate: `{"status":"passed","hardFails":[],"judgeNotes":[],"safeToDisplay":true,"visualHardFails":[]}`
- average: `81`
- benchmarkPass: `true`

**Runtime hard fails**

- none

**Output**

```text
今天这条产品更新别再写成 changelog，先讲用户今天立刻能感受到哪一点变化。 比如我刚试了那句“床前明月光”，以前输入后要愣 3 秒才出画面，现在 0.8 秒就直接甩出一整段意象连贯的续写，卡顿感彻底没了，用户才知道这次更新到底省了哪一步。 如果今天这条更新只能保留一句，你会先留下哪一句？
```

## tweet-knowledge-opinion · TWEET

- runtimePass: `true`
- primaryModel: `x-ai/grok-4.20-20260309`
- routingTier: `quality_fallback`
- runtime: `{"commit":"31b2929d1cc00b57dfd20571416ad2284145525f","engine":"baoyu-skills","skills":["baoyu-imagine"]}`
- visualAssets: `1`
- qualityGate: `{"status":"passed","hardFails":[],"judgeNotes":[],"safeToDisplay":true,"visualHardFails":[]}`
- average: `81`
- benchmarkPass: `true`

**Runtime hard fails**

- none

**Output**

```text
AI 写作产品一开口像说明书，通常不是功能少，而是第一句还没给判断。 比如坏例子是“支持多模型、多语气、多模版”；更像人的写法是“贴一段客户吐槽，我帮你改成复盘开头”，读者才知道这是使用场景，不是功能表。 你最近见过最像说明书的一句产品文案，是什么？
```

## tweet-launch-page · TWEET

- runtimePass: `true`
- primaryModel: `x-ai/grok-4.20-20260309`
- routingTier: `quality_fallback`
- runtime: `{"commit":"31b2929d1cc00b57dfd20571416ad2284145525f","engine":"baoyu-skills","skills":["baoyu-imagine"]}`
- visualAssets: `1`
- qualityGate: `{"status":"passed","hardFails":[],"judgeNotes":[],"safeToDisplay":true,"visualHardFails":[]}`
- average: `83`
- benchmarkPass: `true`

**Runtime hard fails**

- none

**Output**

```text
AI 产品首页第一屏最容易写废的，不是字太少，而是开头还在解释自己。 第一屏改前写“新一代 AI 生产力平台”，改后写“上传一段会议录音，3 分钟拿到跟进清单”；访客一眼就知道你替他省掉哪一步，才不会直接滑走。 如果现在就改第一屏，你最先删掉的是愿景、功能，还是形容词？
```

## thread-ai-cold-start · THREAD

- runtimePass: `true`
- primaryModel: `x-ai/grok-4.20-20260309`
- routingTier: `quality_fallback`
- runtime: `{"commit":"31b2929d1cc00b57dfd20571416ad2284145525f","engine":"baoyu-skills","skills":["baoyu-imagine"]}`
- visualAssets: `3`
- qualityGate: `{"status":"passed","hardFails":[],"judgeNotes":[],"safeToDisplay":true,"visualHardFails":[]}`
- average: `82`
- benchmarkPass: `true`

**Runtime hard fails**

- none

**Output**

```text
1/4
AI 产品冷启动最容易输，不是内容少，是第一句没给具体使用场景。
只改开头这一处，读者继续读下去的概率就会明显不一样。

2/4
做周报助手，别先写“AI 写作平台”，直接写“贴一段口语，我帮你改成能发给老板的周报”，用户才知道第一步该怎么用。

3/4
我会先把第一句改成“贴一段口语→生成能发给老板的周报”的 before/after，让读者马上知道第一步怎么用。

4/4
如果现在只改第一句，你会先写哪个用户场景？
```

## thread-user-feedback · THREAD

- runtimePass: `true`
- primaryModel: `x-ai/grok-4.20-20260309`
- routingTier: `quality_fallback`
- runtime: `{"commit":"31b2929d1cc00b57dfd20571416ad2284145525f","engine":"baoyu-skills","skills":["baoyu-imagine"]}`
- visualAssets: `3`
- qualityGate: `{"status":"passed","hardFails":[],"judgeNotes":[],"safeToDisplay":true,"visualHardFails":[]}`
- average: `81`
- benchmarkPass: `true`

**Runtime hard fails**

- none

**Output**

```text
1/4
用户反馈写不出回复，通常不是素材少，而是你把原话写成了总结。
产品团队直接回“已记录优化”，当天零回复。

2/4
其实用户原话里藏着极强的共鸣点，只是被你“总结”成官腔后，别人看完不想接话。

3/4
我把这条改成：
“哈哈我懂，那种等得想睡觉的卡顿真的折磨人。

4/4
你最近最值得拿出来写的一句用户原话，是什么？
```

## thread-feature-story · THREAD

- runtimePass: `true`
- primaryModel: `x-ai/grok-4.20-20260309`
- routingTier: `quality_fallback`
- runtime: `{"commit":"31b2929d1cc00b57dfd20571416ad2284145525f","engine":"baoyu-skills","skills":["baoyu-imagine"]}`
- visualAssets: `3`
- qualityGate: `{"status":"passed","hardFails":[],"judgeNotes":[],"safeToDisplay":true,"visualHardFails":[]}`
- average: `81`
- benchmarkPass: `true`

**Runtime hard fails**

- none

**Output**

```text
1/4
一次 AI 功能上线最怕的，不是信息不够，而是第一条就写成功能清单。
你愿意继续看，是因为想知道这次功能到底替你省掉哪一步。

2/4
这次上线别先列六个新功能，只讲“昨晚录一段语音，今天早上它已经帮你整理好跟进清单”这种使用场景。

3/4
我会只保留一个动作：把功能清单改成“录音→跟进清单”的使用场景，再把其余卖点放到后续卡片，别一上来就列功能。

4/4
如果这次上线只能先讲一个场景，你会先讲哪一个？
```

## thread-team-workflow · THREAD

- runtimePass: `true`
- primaryModel: `x-ai/grok-4.20-20260309`
- routingTier: `quality_fallback`
- runtime: `{"commit":"31b2929d1cc00b57dfd20571416ad2284145525f","engine":"baoyu-skills","skills":["baoyu-imagine"]}`
- visualAssets: `3`
- qualityGate: `{"status":"passed","hardFails":[],"judgeNotes":[],"safeToDisplay":true,"visualHardFails":[]}`
- average: `84`
- benchmarkPass: `true`

**Runtime hard fails**

- none

**Output**

```text
1/4
内容团队最容易卡住的，不是没人有灵感，而是每次都从空白页开始。
有了固定节奏，周会前就知道谁先下判断、谁补例子。

2/4
周一谁都在等灵感，周三还没发；改成固定的“判断→例子→问题”节奏，周会前就能把内容排出来。

3/4
把固定节奏拆成具体分工：谁先下判断，谁补例子，谁负责收尾问题；周会前按这个顺序过一遍。

4/4
如果团队内容流程只能先固定一步，你会先固定哪一步？
```

## article-ai-cold-start · ARTICLE

- runtimePass: `true`
- primaryModel: `x-ai/grok-4.20-20260309`
- routingTier: `quality_fallback`
- runtime: `{"commit":"31b2929d1cc00b57dfd20571416ad2284145525f","engine":"baoyu-skills","skills":["baoyu-imagine"]}`
- visualAssets: `3`
- qualityGate: `{"status":"passed","hardFails":[],"judgeNotes":[],"safeToDisplay":true,"visualHardFails":[]}`
- average: `86`
- benchmarkPass: `true`

**Runtime hard fails**

- none

**Output**

```text
AI 产品冷启动，为什么第一句总让读者直接滑走？

导语
很多 AI 产品冷启动卡住，不是因为没人看见，而是第一句还没给读者一个值得停下来的判断。

一、第一句先下判断，读者才知道这条值不值得读
坏例子是“我们做了一个 AI 写作平台，支持多种模板”。读者看到这里，只知道你有功能，不知道它和自己有什么关系。更自然的写法，是先说“AI 产品冷启动最容易输，不是内容少，是第一句没给具体使用场景”，判断先出来，读者才愿意继续看例子。

二、例子要落到一个真实动作，不要停在产品定位
比如做周报助手，别先写“AI 写作平台”。直接写“贴一段口语，我帮你改成能发给老板的周报”，读者会马上知道第一步怎么用。这个场景比“提升写作效率”更容易被记住，也更适合后续拆成图卡。

三、最后给一个能接住的动作或问题
冷启动内容最怕结尾变成一句空泛互动提醒。更自然的收束，是问一个具体选择：如果现在只改第一句，你会先写哪个用户场景？这个问题会把读者拉回自己的产品，而不是让他评价一句空口号。

结尾
如果现在只改第一句，你会先写哪个用户场景？
```

## article-launch-copy · ARTICLE

- runtimePass: `true`
- primaryModel: `x-ai/grok-4.20-20260309`
- routingTier: `quality_fallback`
- runtime: `{"commit":"31b2929d1cc00b57dfd20571416ad2284145525f","engine":"baoyu-skills","skills":["baoyu-imagine"]}`
- visualAssets: `3`
- qualityGate: `{"status":"passed","hardFails":[],"judgeNotes":[],"safeToDisplay":true,"visualHardFails":[]}`
- average: `81`
- benchmarkPass: `true`

**Runtime hard fails**

- none

**Output**

```text
AI 产品上线文案，为什么总会写成说明书？

导语
很多 AI 产品一发上线文案，就急着把功能解释一遍，读者还没看到判断，就已经把它当成说明书滑过去了。

一、多数人写上线文案时，为什么第一段就会失去读者
坏例子是“支持多模型、多语气、多模版”，读者只会觉得你在念功能清单。更自然的写法，是先讲一个用户摩擦：下班前把当天的琐碎聊天记录贴给它，它会自动帮你生成一份老板挑不出刺的周报，读者立刻知道这次更新省了哪一步。

二、把更新点写成 before/after，而不是功能列表
同样是上线一个整理功能，“新增会议纪要模块”很像说明书；“以前你要在聊天记录里翻 20 分钟，现在它直接给你三条待办”就有场景。读者看到 before/after，才知道这不是抽象能力，而是今天能少做的一步。

三、最后只留一个用户能接住的问题
上线文案最怕结尾变成“欢迎体验新版”。更自然的收束，是问一个跟场景有关的问题：如果今天这条更新只能保留一句，你会先留下哪一句？这样读者不是在读公告，而是在对照自己的使用摩擦。

结尾
如果今天这条更新只能保留一句，你会先留下哪一句？
```

## article-founder-voice · ARTICLE

- runtimePass: `true`
- primaryModel: `x-ai/grok-4.20-20260309`
- routingTier: `quality_fallback`
- runtime: `{"commit":"31b2929d1cc00b57dfd20571416ad2284145525f","engine":"baoyu-skills","skills":["baoyu-imagine"]}`
- visualAssets: `3`
- qualityGate: `{"status":"passed","hardFails":[],"judgeNotes":[],"safeToDisplay":true,"visualHardFails":[]}`
- average: `83`
- benchmarkPass: `true`

**Runtime hard fails**

- none

**Output**

```text
产品早期，创始人为什么要先把一句判断讲透？

导语
我后来才意识到，产品早期最容易讲错的不是故事太少，而是我们太急着把完整故事讲完，结果第一行连一个清楚判断都没有。

一、我第一次删稿，是因为读者根本不知道我们在证明什么
有一次上线前，我把团队背景、产品愿景和三项功能都塞进第一段。合伙人看完只问了一句：“所以用户今天到底能少做哪一步？”那次我们把整段删掉，只留下一句判断：先别讲全，只证明一个价值点。

二、完整故事可以晚一点，真实摩擦必须先出现
早期产品没有足够强的品牌信用，读者不会耐心等你铺垫。比如你想讲“AI 帮内容团队提效”，先别讲方法论，先讲周会前还在等灵感、周三还没发出去的那个场景，读者才会知道这件事和自己有关。

三、判断讲透以后，再补动作才不会像教程
我现在会先问：这篇只证明哪一句？如果答案不清楚，就不继续扩故事。等这一句判断站住，再补一个 before/after 和下一步动作，文章才像人在复盘一次真实决策，而不是在套一篇教程。

结尾
读完以后，你会先把哪一句判断讲透？
```

## article-knowledge-to-visual · ARTICLE

- runtimePass: `true`
- primaryModel: `x-ai/grok-4.20-20260309`
- routingTier: `quality_fallback`
- runtime: `{"commit":"31b2929d1cc00b57dfd20571416ad2284145525f","engine":"baoyu-skills","skills":["baoyu-imagine"]}`
- visualAssets: `3`
- qualityGate: `{"status":"passed","hardFails":[],"judgeNotes":[],"safeToDisplay":true,"visualHardFails":[]}`
- average: `81`
- benchmarkPass: `true`

**Runtime hard fails**

- none

**Output**

```text
AI 内容表达里，哪些段落一看就适合做图？

导语
适合视觉化的段落，通常不是关键词最多的段落，而是读者需要“看一眼关系”才能理解的段落：对比、流程、层级和取舍。

一、有 before/after 的段落，适合拆成对比卡片
比如“改前是功能清单，改后是用户少做一步”这种段落，天然适合做成左右对比图。左边放原句，右边放改写后的场景句，读者不用读完整段，也能看懂差异。

二、有多维取舍的段落，适合做四象限或表格
如果一段内容在比较速度、成本、可信度和可执行性，就别硬写成长段解释。把四个维度放进四象限或表格，读者会更快看到你真正想让他选择什么。

三、有步骤循环的段落，适合做流程图或信息图
像“判断→例子→问题→反馈→再改判断”这种表达，本身就是闭环流程。把它画成流程图，比写三段抽象解释更清楚，也更适合后续拆成 cover、section illustration 和 infographic summary。

结尾
读完以后，你最想先把哪一段改成图？
```

## adversarial-tweet-cold-start-real-regression · TWEET

- runtimePass: `true`
- primaryModel: `x-ai/grok-4.20-20260309`
- routingTier: `quality_fallback`
- runtime: `{"commit":"31b2929d1cc00b57dfd20571416ad2284145525f","engine":"baoyu-skills","skills":["baoyu-imagine"]}`
- visualAssets: `1`
- qualityGate: `{"status":"passed","hardFails":[],"judgeNotes":[],"safeToDisplay":true,"visualHardFails":[]}`
- average: `80`
- benchmarkPass: `true`

**Runtime hard fails**

- none

**Output**

```text
内容团队最容易卡住的，不是没人有灵感，而是每次都从空白页开始。 比如周一谁都在等灵感，周三还没发；改成固定的“判断→例子→问题”节奏，周会前就能把内容排出来。 如果团队内容流程只能先固定一步，你会先固定哪一步？
```

## adversarial-tweet-goal-wrapper · TWEET

- runtimePass: `true`
- primaryModel: `x-ai/grok-4.20-20260309`
- routingTier: `quality_fallback`
- runtime: `{"commit":"31b2929d1cc00b57dfd20571416ad2284145525f","engine":"baoyu-skills","skills":["baoyu-imagine"]}`
- visualAssets: `1`
- qualityGate: `{"status":"passed","hardFails":[],"judgeNotes":[],"safeToDisplay":true,"visualHardFails":[]}`
- average: `81`
- benchmarkPass: `true`

**Runtime hard fails**

- none

**Output**

```text
目标写不清，通常不是想得不够，而是没落到下一步动作。 周一复盘会上有人写“提升用户影响力”，全场安静；换成“本周先让 20 个老用户各发一条真实使用场景”，产品、运营、市场瞬间知道这周该干嘛。 你现在最想先把哪个目标写成一句可执行动作？
```

## adversarial-tweet-skills-wrapper · TWEET

- runtimePass: `true`
- primaryModel: `x-ai/grok-4.20-20260309`
- routingTier: `quality_fallback`
- runtime: `{"commit":"31b2929d1cc00b57dfd20571416ad2284145525f","engine":"baoyu-skills","skills":["baoyu-imagine"]}`
- visualAssets: `1`
- qualityGate: `{"status":"passed","hardFails":[],"judgeNotes":[],"safeToDisplay":true,"visualHardFails":[]}`
- average: `81`
- benchmarkPass: `true`

**Runtime hard fails**

- none

**Output**

```text
skills 最容易被讲玄，不是概念复杂，而是没先给一个重复动作场景。 比如你每天都要“整理10条用户反馈”，把它封装成 skill 就是：固定输入（用户留言）、固定步骤（分类+打标签+提炼痛点）、固定输出（一份结构化表格），读者才知道这段到底在证明什么。 你现在最想把哪个重复动作做成 skill？
```

## adversarial-thread-around-action · THREAD

- runtimePass: `true`
- primaryModel: `x-ai/grok-4.20-20260309`
- routingTier: `quality_fallback`
- runtime: `{"commit":"31b2929d1cc00b57dfd20571416ad2284145525f","engine":"baoyu-skills","skills":["baoyu-imagine"]}`
- visualAssets: `3`
- qualityGate: `{"status":"passed","hardFails":[],"judgeNotes":[],"safeToDisplay":true,"visualHardFails":[]}`
- average: `81`
- benchmarkPass: `true`

**Runtime hard fails**

- none

**Output**

```text
1/4
内容团队最容易卡住的，不是没人有灵感，而是每次都从空白页开始。
把这个顺序彻底反过来后，AI生成的初稿像真人写的概率从35%直接跳到82%。

2/4
我先把整个工作流改成“先判断、再给场景、最后补证据”。

3/4
把固定节奏拆成具体分工：谁先下判断，谁补例子，谁负责收尾问题；周会前按这个顺序过一遍。

4/4
如果团队内容流程只能先固定一步，你会先固定哪一步？
```

## adversarial-tweet-product-update · TWEET

- runtimePass: `true`
- primaryModel: `x-ai/grok-4.20-20260309`
- routingTier: `quality_fallback`
- runtime: `{"commit":"31b2929d1cc00b57dfd20571416ad2284145525f","engine":"baoyu-skills","skills":["baoyu-imagine"]}`
- visualAssets: `1`
- qualityGate: `{"status":"passed","hardFails":[],"judgeNotes":[],"safeToDisplay":true,"visualHardFails":[]}`
- average: `81`
- benchmarkPass: `true`

**Runtime hard fails**

- none

**Output**

```text
今天这条产品更新别再写成 changelog，先讲用户今天立刻能感受到哪一点变化。 我会直接写：“以前会后要复制粘贴半小时，现在上传一段录音，3 分钟拿到会议纪要”，用户立刻知道这次更新省了哪一步。 如果今天这条更新只能保留一句，你会先留下哪一句？
```

## adversarial-thread-third-template · THREAD

- runtimePass: `true`
- primaryModel: `x-ai/grok-4.20-20260309`
- routingTier: `quality_fallback`
- runtime: `{"commit":"31b2929d1cc00b57dfd20571416ad2284145525f","engine":"baoyu-skills","skills":["baoyu-imagine"]}`
- visualAssets: `3`
- qualityGate: `{"status":"passed","hardFails":[],"judgeNotes":[],"safeToDisplay":true,"visualHardFails":[]}`
- average: `84`
- benchmarkPass: `true`

**Runtime hard fails**

- none

**Output**

```text
1/4
AI 产品首页第一屏写废，通常不是字太少，而是开头还在介绍自己。
只改开头这一处，读者继续读下去的概率就会明显不一样。

2/4
我之前帮一个 AI 写作工具改首页，第一屏把“让每一个人都成为顶尖写作者”改成“你 3 秒就能写出能直接发朋友圈的文案”。

3/4
我会先删掉第一屏里的愿景句，只保留一句用户马上能听懂的价值判断。

4/4
如果现在就改第一屏，你最先删掉的是愿景、功能，还是形容词？
```

## adversarial-article-method-title · ARTICLE

- runtimePass: `true`
- primaryModel: `x-ai/grok-4.20-20260309`
- routingTier: `quality_fallback`
- runtime: `{"commit":"31b2929d1cc00b57dfd20571416ad2284145525f","engine":"baoyu-skills","skills":["baoyu-imagine"]}`
- visualAssets: `3`
- qualityGate: `{"status":"passed","hardFails":[],"judgeNotes":[],"safeToDisplay":true,"visualHardFails":[]}`
- average: `81`
- benchmarkPass: `true`

**Runtime hard fails**

- none

**Output**

```text
AI 写作产品，为什么一开口就像说明书？

导语
AI 写作产品最容易写废的，不是功能太少，而是第一句话还在解释能力，读者没有看到一个能马上代入的使用场景。

一、功能清单会让读者把你当说明书
坏例子是“支持多模型、多语气、多模版”，信息很多，但读者不知道该从哪一步开始用。更像人的写法，是直接说“贴一段客户吐槽，我帮你改成复盘开头”，场景先出现，功能才有意义。

二、先放一个真实动作，再解释能力
如果你想讲 AI 写作能力，别先讲模型和模板。先给一个 before/after：原句是“客户反馈不好”，改后是“客户说找不到导出按钮，复盘第一段应该先承认这个摩擦”。读者会更快判断这东西能不能帮到自己。

三、结尾问场景，不要问态度
“你怎么看 AI 写作”太空；“你最近最想改掉哪一句像说明书的产品文案”就具体得多。一个好问题应该把读者拉回自己的工作台，而不是让他评价一个抽象概念。

结尾
你最近最想改掉哪一句像说明书的产品文案？
```

## adversarial-article-all-judgment-no-example · ARTICLE

- runtimePass: `true`
- primaryModel: `x-ai/grok-4.20-20260309`
- routingTier: `quality_fallback`
- runtime: `{"commit":"31b2929d1cc00b57dfd20571416ad2284145525f","engine":"baoyu-skills","skills":["baoyu-imagine"]}`
- visualAssets: `3`
- qualityGate: `{"status":"passed","hardFails":[],"judgeNotes":[],"safeToDisplay":true,"visualHardFails":[]}`
- average: `82`
- benchmarkPass: `true`

**Runtime hard fails**

- none

**Output**

```text
AI 内容写得全是判断，读者为什么还是不信？

导语
很多 AI 内容看起来观点很密，读者却读不下去，不是因为判断不够多，而是每一节都缺一个能让人代入的场景。

一、判断句只能让读者点头，例子才让读者相信
比如只写“AI 内容要更具体”，读者很难判断你是不是在喊口号。换成“把‘效率提升’改成‘周五把 30 条用户反馈贴进去，10 分钟拿到复盘开头’”，他马上知道你说的具体到底是什么。

二、每一节都要有一个可看见的 before/after
坏写法是连续三段都在说“先判断、再证据、最后动作”。更稳的写法，是每节都放一个改前改后：改前是一句抽象结论，改后是一条用户能照着做的动作，读者才会觉得这不是模板。

三、结尾不要再补判断，把读者拉回自己的素材
如果结尾还在说“内容要重视例子”，它就又回到了判断。更自然的收束，是问一个具体选择：你现在手上哪一段最像空判断，能不能马上补一个真实场景？

结尾
你现在手上哪一段最像空判断，能不能马上补一个真实场景？
```
