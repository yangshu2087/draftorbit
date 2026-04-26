# SkillTrust 项目真实内容质量 UAT (2026-04-26T07:24:26.063Z)

- API: http://127.0.0.1:4311
- Project: SkillTrust 质量 UAT 2026-04-26 (fab8dd76-4939-4186-94df-e103902dc884)
- Scenarios: 3
- Passed: 3/3

## Summary

| Scenario | Run | Duration | Pass | Assets | Quality | Evidence |
|---|---:|---:|---:|---:|---:|---|
| 审计演示：安装前先看边界 | 813cc682-b819-450e-bde7-4ca3030bb6b3 | 54.0s | PASS | 4 | 72.84 | all checks |
| 风险教育：Skill 不是 prompt 文案 | bd9e03e8-deb7-4fbe-a69a-82489dae1d64 | 50.9s | PASS | 4 | 72.86 | all checks |
| 工作流方法：从发现到人工决定 | b6afb137-a70a-40e2-825c-ee2d87beb846 | 83.6s | PASS | 4 | 72.7 | all checks |

## Generated threads

### 审计演示：安装前先看边界

- runId: 813cc682-b819-450e-bde7-4ca3030bb6b3
- visualAssetsReady: 4
- bundle: /v3/chat/runs/813cc682-b819-450e-bde7-4ca3030bb6b3/assets.zip?token=<redacted-local-token>
- usage: codex-local/quick:quality_fallback, codex-local/quick:quality_fallback, codex-local/quick:quality_fallback

```text
1/5
装 Codex/Claude skill 前，最该看的不是功能有多香。
先看它会碰到哪些执行边界。

2/5
真实场景：README 写“自动整理文件”，但安装命令会拉脚本、读工作区、联网请求，还可能要求 token。这里才是安装前判断的重点。

3/5
我会按 5 个信号看：来源/作者、install 命令、文件读写、网络外传、凭据要求。少一个证据，就先降级成待核验。

4/5
SkillTrust 不是安全担保。它做的是把来源、权限和风险信号聚在一起，让你别在兴奋时盲装。

5/5
评论区丢一个 Skill 链接或描述，我挑几个做公开审计。
```

### 风险教育：Skill 不是 prompt 文案

- runId: bd9e03e8-deb7-4fbe-a69a-82489dae1d64
- visualAssetsReady: 4
- bundle: /v3/chat/runs/bd9e03e8-deb7-4fbe-a69a-82489dae1d64/assets.zip?token=<redacted-local-token>
- usage: codex-local/quick:quality_fallback, codex-local/quick:quality_fallback, codex-local/quick:quality_fallback

```text
1/5
AI skill 不是 prompt 文案。
更准确地说，它可能是一个能被 Agent 调用的工作流入口。

2/5
Prompt 主要影响输出；skill 可能影响执行：读文件、跑命令、联网、调用 API、要求 token。风险边界完全不是一回事。

3/5
所以安装前先问 5 件事：来源是谁、装了什么、能碰哪些文件、会不会联网、要不要长期凭据。

4/5
SkillTrust 的价值不是替你保证安全，而是把这些证据放到同一页，降低你安装前的判断成本。

5/5
评论区丢一个 Skill 链接或描述，我挑几个做公开审计。
```

### 工作流方法：从发现到人工决定

- runId: b6afb137-a70a-40e2-825c-ee2d87beb846
- visualAssetsReady: 4
- bundle: /v3/chat/runs/b6afb137-a70a-40e2-825c-ee2d87beb846/assets.zip?token=<redacted-local-token>
- usage: codex-local/quick:quality_fallback, codex-local/quick:quality_fallback, codex-local/quick:quality_fallback, codex-local/quick:quality_fallback

```text
1/5
看到一个很香的 AI skill，我现在不会先点安装。
我会先走 SkillTrust 的 5 步：搜来源、看命令、查权限、比证据、再人工决定。

2/5
第一步看来源：作者是谁、仓库是否公开、最近有没有维护。来源不清，功能越诱人越要慢一点。

3/5
第二步看执行边界：install 命令、文件读写、联网外传、token/凭据。这里决定它只是辅助，还是已经能影响你的环境。

4/5
第三步才比较功能。不是“能不能用”，而是证据够不够、风险能不能接受、要不要先沙箱试。

5/5
评论区丢一个 Skill 链接或描述，我挑几个做公开审计。
```

## Quality checks

### audit-demo

- ✅ enoughPosts
- ✅ namesSkillTrust
- ✅ concreteRisk
- ✅ manualBoundary
- ✅ noForbiddenClaim
- ✅ noPromptLeak
- ✅ visualAssetsReady
- ✅ bundleReady
- ✅ qualityGatePassed
- ✅ scenarioFit

### risk-education

- ✅ enoughPosts
- ✅ namesSkillTrust
- ✅ concreteRisk
- ✅ manualBoundary
- ✅ noForbiddenClaim
- ✅ noPromptLeak
- ✅ visualAssetsReady
- ✅ bundleReady
- ✅ qualityGatePassed
- ✅ scenarioFit

### workflow-method

- ✅ enoughPosts
- ✅ namesSkillTrust
- ✅ concreteRisk
- ✅ manualBoundary
- ✅ noForbiddenClaim
- ✅ noPromptLeak
- ✅ visualAssetsReady
- ✅ bundleReady
- ✅ qualityGatePassed
- ✅ scenarioFit

## Browser / visual evidence

- Route checked: `http://127.0.0.1:3400/projects`
- Real browser pass: Playwright Chromium, viewport `1440x1050`, local API `http://127.0.0.1:4311`.
- Visible state verified: `项目运营工作台`, `SkillTrust 预设`, `发布前人工确认`, `生成本轮项目内容`.
- Console errors: `[]`.
- Screenshot: `output/playwright/manual-check/skilltrust-project-quality-uat-2026-04-26.png` (local-only ignored artifact).

## Backend / API evidence

- API contract exercised: `POST /auth/local/session`, `POST /v3/projects`, `POST /v3/projects/:id/generate`, `GET /v3/chat/runs/:id/stream`, `GET /v3/chat/runs/:id`.
- Permissions: all project and run reads used Bearer token from the local self-host session; generated runs are linked to the created project/workspace.
- Error/data boundary: report redacts signed `assets.zip` token values as `<redacted-local-token>`; generated visual binaries stay under ignored local artifacts.
- Safety semantics: all three runs passed `qualityGatePassed`, `noPromptLeak`, `noForbiddenClaim`, and manual publish boundary checks; no auto-post or payment action was executed.
