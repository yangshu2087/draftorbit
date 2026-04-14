# DraftOrbit × baoyu ordinary-user sync comparison (2026-04-14_00-28-39)

- API: `http://127.0.0.1:4311`
- Web: `http://127.0.0.1:3300`
- Evidence root: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ordinary-user-baoyu-audit/output/playwright/ordinary-user-baoyu-sync-2026-04-14_00-28-39`
- baoyu-skills commit: `dcd0f8143349`
- Cases: `1`
- Pass count: `1/1`

## Comparison policy

- DraftOrbit is tested through the ordinary `/` → `/app` user path, not only direct API calls.
- baoyu runtime comparison uses real runnable artifacts where available: source capture, markdown normalization, visual prompt files and baoyu-imagine image artifacts.
- baoyu does not expose a direct tweet/thread/article writer CLI in this pinned runtime; writer quality is judged against the baoyu fixed/adversarial rubric without faking direct baoyu text output.
- `draftorbit/heuristic`, `openrouter/free`, `ollama/*`, placeholder images and mock images invalidate test_high evidence.

## Evidence notes

- No real OPENAI_API_KEY/OPENROUTER_API_KEY was available for this run; mock/free/local generations must not be counted as baoyu quality pass evidence.
- No live search provider was configured; ambiguous latest-fact prompts are expected to fail closed unless the user supplies a URL.

## Ordinary-user route audit

- Routes: `5/5`
- Breakpoints per route: `375`, `768`, `1024`, `1440`

### home · `/`

- pass: `true`
- finalUrl: `http://127.0.0.1:3300/`
- checkedCopy: `你说一句话，DraftOrbit 帮你产出可发的 X 内容`, `进入生成器`
- body: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ordinary-user-baoyu-audit/output/playwright/ordinary-user-baoyu-sync-2026-04-14_00-28-39/routes/home/body.txt`
- screenshots: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ordinary-user-baoyu-audit/output/playwright/ordinary-user-baoyu-sync-2026-04-14_00-28-39/routes/home/375.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ordinary-user-baoyu-audit/output/playwright/ordinary-user-baoyu-sync-2026-04-14_00-28-39/routes/home/768.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ordinary-user-baoyu-audit/output/playwright/ordinary-user-baoyu-sync-2026-04-14_00-28-39/routes/home/1024.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ordinary-user-baoyu-audit/output/playwright/ordinary-user-baoyu-sync-2026-04-14_00-28-39/routes/home/1440.png`
- consoleErrors: none
- ordinary landing page entry path

### app · `/app`

- pass: `true`
- finalUrl: `http://127.0.0.1:3300/app`
- checkedCopy: `开始生成`, `高级选项`, `未连接 X 账号 · 仍可先生成`
- body: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ordinary-user-baoyu-audit/output/playwright/ordinary-user-baoyu-sync-2026-04-14_00-28-39/routes/app/body.txt`
- screenshots: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ordinary-user-baoyu-audit/output/playwright/ordinary-user-baoyu-sync-2026-04-14_00-28-39/routes/app/375.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ordinary-user-baoyu-audit/output/playwright/ordinary-user-baoyu-sync-2026-04-14_00-28-39/routes/app/768.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ordinary-user-baoyu-audit/output/playwright/ordinary-user-baoyu-sync-2026-04-14_00-28-39/routes/app/1024.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ordinary-user-baoyu-audit/output/playwright/ordinary-user-baoyu-sync-2026-04-14_00-28-39/routes/app/1440.png`
- consoleErrors: none
- local quick experience generator shell

### connect · `/connect?intent=connect_x_self`

- pass: `true`
- finalUrl: `http://127.0.0.1:3300/app?nextAction=connect_x_self`
- checkedCopy: `连接 X 账号后再发布会更顺`, `连接 X 账号`
- body: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ordinary-user-baoyu-audit/output/playwright/ordinary-user-baoyu-sync-2026-04-14_00-28-39/routes/connect/body.txt`
- screenshots: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ordinary-user-baoyu-audit/output/playwright/ordinary-user-baoyu-sync-2026-04-14_00-28-39/routes/connect/375.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ordinary-user-baoyu-audit/output/playwright/ordinary-user-baoyu-sync-2026-04-14_00-28-39/routes/connect/768.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ordinary-user-baoyu-audit/output/playwright/ordinary-user-baoyu-sync-2026-04-14_00-28-39/routes/connect/1024.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ordinary-user-baoyu-audit/output/playwright/ordinary-user-baoyu-sync-2026-04-14_00-28-39/routes/connect/1440.png`
- consoleErrors: none
- connect route redirects into the app task panel instead of exposing a dead page

### queue · `/queue?intent=confirm_publish`

- pass: `true`
- finalUrl: `http://127.0.0.1:3300/app?nextAction=confirm_publish`
- checkedCopy: `确认这条内容是否发出`, `当前待确认内容`
- body: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ordinary-user-baoyu-audit/output/playwright/ordinary-user-baoyu-sync-2026-04-14_00-28-39/routes/queue/body.txt`
- screenshots: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ordinary-user-baoyu-audit/output/playwright/ordinary-user-baoyu-sync-2026-04-14_00-28-39/routes/queue/375.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ordinary-user-baoyu-audit/output/playwright/ordinary-user-baoyu-sync-2026-04-14_00-28-39/routes/queue/768.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ordinary-user-baoyu-audit/output/playwright/ordinary-user-baoyu-sync-2026-04-14_00-28-39/routes/queue/1024.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ordinary-user-baoyu-audit/output/playwright/ordinary-user-baoyu-sync-2026-04-14_00-28-39/routes/queue/1440.png`
- consoleErrors: none
- queue route redirects into the app task panel instead of a separate backstage UI

### pricing · `/pricing`

- pass: `true`
- finalUrl: `http://127.0.0.1:3300/pricing`
- checkedCopy: `升级与结账`, `月付`
- body: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ordinary-user-baoyu-audit/output/playwright/ordinary-user-baoyu-sync-2026-04-14_00-28-39/routes/pricing/body.txt`
- screenshots: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ordinary-user-baoyu-audit/output/playwright/ordinary-user-baoyu-sync-2026-04-14_00-28-39/routes/pricing/375.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ordinary-user-baoyu-audit/output/playwright/ordinary-user-baoyu-sync-2026-04-14_00-28-39/routes/pricing/768.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ordinary-user-baoyu-audit/output/playwright/ordinary-user-baoyu-sync-2026-04-14_00-28-39/routes/pricing/1024.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ordinary-user-baoyu-audit/output/playwright/ordinary-user-baoyu-sync-2026-04-14_00-28-39/routes/pricing/1440.png`
- consoleErrors: none
- billing entry does not trigger real payment until the user clicks checkout

## Product-relevant baoyu matrix

| baoyu skill | status | DraftOrbit usage | test evidence | gap / remaining reason | repair result |
| --- | --- | --- | --- | --- | --- |
| `baoyu-url-to-markdown` | `runtime_integrated` | Clear user-provided URLs are captured as markdown sourceArtifacts before latest/source-required article generation. | `latest-hermes-agent-url-source` requires a ready `sourceArtifacts[].markdownPath` and rejects source-free latest-fact output. | No remaining product gap for explicit URL capture in the ordinary-user UAT scope. | Pinned runtime to audited upstream main and keeps source-ready assertions in the UAT script. |
| `baoyu-danger-x-to-markdown` | `runtime_integrated` | X/Twitter source URLs are routed through the baoyu source-capture runtime when the user supplies social-source evidence. | Source cases assert fail-closed behavior unless a captured markdown artifact is present; dangerous login/posting actions are not invoked. | Only capture/export is in scope; no reverse-engineered login flow is allowed in DraftOrbit. | Documented as safe source capture only, with latest/source ambiguity blocked for ordinary users. |
| `baoyu-format-markdown` | `rubric_or_prompt_reference` | Article readability and markdown hygiene are enforced through DraftOrbit result gates and ordinary-user copy assertions. | Article cases reject generic scaffold output, title repetition, method-framework title tone and prompt-wrapper leaks. | Not exposed as a separate user action; used as formatting/rubric parity rather than a standalone CLI button. | Report marks this as rubric parity, not falsely as a direct DraftOrbit runtime call. |
| `baoyu-imagine` | `runtime_integrated` | Visual plans produce prompt files and app-rendered SVG artifacts with baoyu runtime provenance while avoiding placeholder/mock images. | Tweet/thread/article cases require ready visualAssets, promptPath, template-svg renderer, app-rendered textLayer and no prompt leaks. | External image-provider keys may be absent locally; UAT treats mock/placeholder artifacts as failures for quality evidence. | Pinned runtime and ordinary-user UAT keep the provider/mock distinction explicit. |
| `baoyu-image-gen` | `rubric_or_prompt_reference` | Covered through the same visual provider seam as baoyu-imagine; DraftOrbit does not expose a separate image-gen mode in this UI. | Visual artifact assertions cover ready/failed states, downloadability and retry copy instead of raw provider details. | No standalone user-facing image-gen promise exists in the restored product surface. | Tracked as visual runtime parity, not forced into the ordinary-user UI as a new feature. |
| `baoyu-image-cards` | `rubric_or_prompt_reference` | Thread generation must produce a ready `cards` asset and responsive gallery evidence for ordinary users. | `thread-product-update` rejects runs missing a ready cards asset or leaking card number labels into visual cues. | The upstream skill is prompt/reference-oriented in this pin, so DraftOrbit validates card deliverables rather than calling a CLI. | Kept a hard UAT assertion for thread cards. |
| `baoyu-cover-image` | `rubric_or_prompt_reference` | Tweet and article outputs require cover-style visual artifacts with visible ordinary-user gallery state. | Visual UAT requires ready cover assets for article cases and visible “主视觉方向/图文资产” UI copy. | No separate cover-image CLI is invoked from DraftOrbit in this recovery pass. | Report identifies the gap as intentional product-surface consolidation. |
| `baoyu-infographic` | `rubric_or_prompt_reference` | Article outputs require a summary visual asset: infographic or illustration. | Article cases reject runs without a ready cover plus infographic/illustration asset. | No separate infographic CLI is invoked from the current ordinary-user UI. | Kept artifact-level assertion instead of adding an unplanned feature. |
| `baoyu-article-illustrator` | `rubric_or_prompt_reference` | Article result previews require a section visual path through illustration or infographic assets. | Article UAT accepts ready illustration/infographic evidence and rejects missing summary/section visuals. | Upstream exposes batch helper scripts, but DraftOrbit keeps article illustration behind its restored visual pipeline. | Documented as parity-through-artifact instead of direct CLI execution. |
| `baoyu-compress-image` | `safe_gap` | Current DraftOrbit can download generated assets but does not promise a separate compression workflow. | UAT checks “下载全部图文资产” state and leaves large image/provider artifacts local-only. | Compression is a future delivery hardening gap, not a restored active UI feature. | Kept out of runtime; report flags it for a future safe delivery pass. |
| `baoyu-markdown-to-html` | `safe_gap` | Article output is previewed/export-prepared in DraftOrbit but no HTML export button is promised in this UI. | Article cases verify readable article structure and publish/queue readiness without invoking external HTML export. | HTML export remains an adjacent recoverable enhancement. | Documented as a non-blocking product gap. |
| `baoyu-post-to-x` | `blocked_external_action` | DraftOrbit only prepares/queues/manual-confirms publish state; real X posting is blocked unless a safe explicit integration exists. | Tweet/thread UAT requires “连接 X 后才能发布” visibility and never executes a real post. | Real external posting and reverse-engineered login flows are intentionally out of scope for this local audit. | Kept as sandbox/manual publish-prep only and documented in the report matrix. |

## latest-hermes-source · article

- pass: `true`
- runId: `3002fff2-c896-4bf7-85d8-a3ab8a46f84a`
- prompt: 生成关于最新的 Hermes 的文章
- primaryModel: `source-blocked`
- routingTier: `source-blocked`
- runtimeEngine: `source-blocked`
- visualAssetsReady: `0`
- visualAssetsFailed: `0`
- sourceStatus: `not_configured`
- sourcePass: `true`
- screenshot: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ordinary-user-baoyu-audit/output/playwright/ordinary-user-baoyu-sync-2026-04-14_00-28-39/latest-hermes-source/app-result.png`
- finalJson: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ordinary-user-baoyu-audit/output/playwright/ordinary-user-baoyu-sync-2026-04-14_00-28-39/latest-hermes-source/final.json`

**Prompt leaks**

- none

**baoyu sync notes**

- source case：若 Tavily 与 baoyu URL 抓取可用，必须进入 sourceArtifacts；若 Hermes 歧义或搜索未配置，必须 fail-closed 并显示“需要可靠来源”。
- source failed but correctly blocked
