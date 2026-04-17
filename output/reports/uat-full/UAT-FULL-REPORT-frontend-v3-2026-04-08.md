# DraftOrbit 前端侧 UAT 证据（2026-04-08）

- 日期：2026-04-08
- 范围：V3 前端重构后的首页 `/`、生成器 `/app`、App 内任务面板、Pricing 降级后的入口表现
- 环境：本地 Web `http://127.0.0.1:3000`，本地 API `http://127.0.0.1:4000`
- 方法：本地浏览器人工/Playwright CLI 联合验收
- 定位说明：这是一份**前端侧证据补充**，不是生产环境全链路发布证明

## 1. 验收目标

验证这轮前端重构是否符合新的用户视角目标：

1. 首页是“一句话价值 + 立即开始”入口，而不是销售页/解释页
2. 登录后主入口聚焦 `/app` 单屏生成器
3. `/connect`、`/queue` 通过 `/app` 内 `nextAction` 面板承接，不再是显式后台入口
4. Pricing 不再出现在主导航和主流程首屏
5. 生成、结果展示、错误态都能以动作导向方式收口

## 2. 代码级验证

已执行并通过：

```bash
./apps/web/node_modules/.bin/tsx --test apps/web/test/v3-ui.test.ts
npx pnpm@10.23.0 --filter @draftorbit/web typecheck
npx pnpm@10.23.0 --filter @draftorbit/web build
```

结果：
- `apps/web/test/v3-ui.test.ts`：4/4 通过
- `@draftorbit/web typecheck`：通过
- `@draftorbit/web build`：通过

## 3. 浏览器验收结果

### 场景 A：首页 `/` 已收口为极简入口
**结论：通过**

观察到：
- 首页标题直接表达为“你说一句话，DraftOrbit 帮你产出可发的 X 内容”
- 首屏保留登录/开始按钮，不再把 Pricing 作为主导航入口
- 页面主体只保留：价值说明、示例输入/输出、三步说明
- 未见旧的“聊天中枢”“工作台”“套餐导流”式主路径表达

证据：
- `output/playwright/uat-frontend-2026-04-08/home-375.png`
- `output/playwright/uat-frontend-2026-04-08/home-768.png`
- `output/playwright/uat-frontend-2026-04-08/home-1024.png`
- `output/playwright/uat-frontend-2026-04-08/home-1440.png`

### 场景 B：本机快速体验登录后直达 `/app`
**结论：通过**

观察到：
- 首页点击“本机快速体验”后，浏览器进入 `/app`
- 登录后主导航只保留“生成器”
- 头部未再主动暴露 Pricing

证据：
- Playwright snapshot：进入 `/app` 后仅存在“生成器”主导航
- `output/playwright/uat-frontend-2026-04-08/app-1440.png`

### 场景 C：`/app` 首屏聚焦“一句话生成”
**结论：通过**

观察到：
- `/app` 第一屏聚焦输入框、开始生成、结果区
- 高级选项默认折叠
- 结果区空态文案明确，不再像后台控制台
- 首屏没有额外套餐售卖入口

证据：
- `output/playwright/uat-frontend-2026-04-08/app-1440.png`
- Playwright snapshot：`/app` 首屏含输入框、开始生成、结果区空态

### 场景 D：`nextAction` 改为 App 内任务面板
**结论：通过**

观察到：
- 访问 `/app?nextAction=connect_x_self` 时，右侧出现任务面板
- 面板文案为当前任务导向，而不是独立后台页面说明
- 当前任务只有一个主动作：“连接 X 账号”

证据：
- `output/playwright/uat-frontend-2026-04-08/app-task-connect.png`
- Playwright snapshot：页面中出现“当前必须完成 / 先连接你的 X 账号 / 连接 X 账号”结构

### 场景 E：一句话生成在 `/app` 内完成闭环
**结论：通过**

操作：
- 点击快捷示例“帮我发一条关于 AI 产品冷启动的观点短推”
- 点击“开始生成”

观察到：
- 生成过程中显示阶段进度：研究 / 结构 / 草稿 / 文风 / 配图 / 发布前检查
- 结果完成后，结果区直接展示：质量分、为什么这样写、正文、风险状态、操作按钮
- 用户无需跳页即可继续“手动编辑 / 复制文本 / 加入待确认”

证据：
- Playwright snapshot：生成中状态显示阶段进度与 runId
- Playwright snapshot：结果完成后显示“质量分 77.03 / 建议快速审一下 / 手动编辑 / 复制文本 / 加入待确认”

### 场景 F：缺少 X 账号时，错误态给出可执行动作
**结论：通过**

操作：
- 在未连接 X 账号状态下点击“加入待确认”

观察到：
- 页面出现错误卡片“操作未完成”
- 错误文本为“当前没有可用 X 账号，请先完成连接。”
- 同时提供动作入口“连接 X 账号”，深链为 `/app?nextAction=connect_x_self`
- 错误态没有把用户扔到独立后台页

证据：
- `output/playwright/uat-frontend-2026-04-08/app-375-error.png`
- Playwright snapshot：错误卡片内含“立即重试”“连接 X 账号”

### 场景 G：浏览器控制台错误检查
**结论：通过**

观察到：
- Playwright `console error` 返回 `Errors: 0`
- 本轮没有复现此前 favicon 404 问题

证据：
- Playwright console 输出：`Total messages: 2 (Errors: 0, Warnings: 0)`

## 4. 本轮结论

### 已达成
- 首页已从销售/解释页收口为一句话入口页
- `/app` 已从后台感页面收口为单屏生成器
- `connect` / `queue` 已切换为 `/app` 内任务面板心智
- Pricing 已降级为被动入口，不再占据主导航和主流程首屏
- 关键错误态已能给出下一步动作，而不是停留在解释性页面

### 仍保留的现实情况
- 未连接 X 账号时，发布前动作仍会被阻塞；这是业务约束，不是前端缺陷
- 当前结果中的“为什么这样写”仍可能混入偏技术化英文句子，这是后续文案/结果清洗问题
- 本报告只覆盖本地前端侧证据，不等同于生产发布验收

## 5. 证据文件索引

### 截图
- `output/playwright/uat-frontend-2026-04-08/home-375.png`
- `output/playwright/uat-frontend-2026-04-08/home-768.png`
- `output/playwright/uat-frontend-2026-04-08/home-1024.png`
- `output/playwright/uat-frontend-2026-04-08/home-1440.png`
- `output/playwright/uat-frontend-2026-04-08/app-1440.png`
- `output/playwright/uat-frontend-2026-04-08/app-task-connect.png`
- `output/playwright/uat-frontend-2026-04-08/app-375-error.png`

### 代码验证依据
- `apps/web/test/v3-ui.test.ts`
- `apps/web/components/v3/home-page.tsx`
- `apps/web/components/v3/operator-app.tsx`
- `apps/web/components/v3/operator-task-panel.tsx`
- `apps/web/components/v3/shell.tsx`
- `apps/web/app/pricing/page.tsx`
- `apps/web/lib/v3-ui.ts`

## 6. 结论判定

前端重构目标在**本地前端侧**已达到“可提交评审版”。

当前可以支持的评审判断：
- 可以明确说明本轮不是在做“聊天后台”，而是在做“一句话生成器”
- 可以明确说明主流路径已经从多入口收束为 `/` -> `/app`
- 可以明确说明 Pricing 已不再作为主导航售卖入口
- 可以明确说明 `nextAction` 已收敛为 App 内任务面板

