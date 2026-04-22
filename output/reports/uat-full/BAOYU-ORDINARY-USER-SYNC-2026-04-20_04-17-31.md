# DraftOrbit × baoyu ordinary-user sync comparison (2026-04-20_04-17-31)

- API: `http://127.0.0.1:4311`
- Web: `http://127.0.0.1:3300`
- Evidence root: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31`
- baoyu-skills commit: `9977ff520c49`
- Cases: `7`
- Pass count: `7/7`

## Comparison policy

- DraftOrbit is tested through the ordinary `/` → `/app` user path, not only direct API calls.
- baoyu runtime comparison uses real runnable artifacts where available: source capture, markdown normalization, visual prompt/spec files, local SVG assets and baoyu-imagine provider seams.
- baoyu does not expose a direct tweet/thread/article writer CLI in this pinned runtime; writer quality is judged against the baoyu fixed/adversarial rubric without faking direct baoyu text output.
- `draftorbit/heuristic`, `openrouter/free`, `ollama/*`, placeholder images and mock images invalidate test_high evidence; `codex-local/*` counts only when explicitly enabled by `CODEX_LOCAL_ALLOW_QUALITY_EVIDENCE=1`.

## Evidence notes

- No real OPENAI_API_KEY/OPENROUTER_API_KEY was available; this run allows Codex OAuth local adapter evidence only because CODEX_LOCAL_ALLOW_QUALITY_EVIDENCE=1 and the adapter smoke must pass.
- No live search provider was configured; ambiguous latest-fact prompts are expected to fail closed unless the user supplies a URL.

## Ordinary-user route audit

- Routes: `5/5`
- Breakpoints per route: `375`, `768`, `1024`, `1440`

### home · `/`

- pass: `true`
- finalUrl: `http://127.0.0.1:3300/`
- checkedCopy: `你说一句话，DraftOrbit 帮你产出可发的 X 内容`, `进入生成器`
- body: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/routes/home/body.txt`
- screenshots: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/routes/home/375.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/routes/home/768.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/routes/home/1024.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/routes/home/1440.png`
- consoleErrors: none
- ordinary landing page entry path

### app · `/app`

- pass: `true`
- finalUrl: `http://127.0.0.1:3300/app`
- checkedCopy: `开始生成`, `高级选项`, `未连接 X 账号 · 仍可先生成`
- body: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/routes/app/body.txt`
- screenshots: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/routes/app/375.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/routes/app/768.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/routes/app/1024.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/routes/app/1440.png`
- consoleErrors: none
- local quick experience generator shell

### connect · `/connect?intent=connect_x_self`

- pass: `true`
- finalUrl: `http://127.0.0.1:3300/app?nextAction=connect_x_self`
- checkedCopy: `连接 X 账号后再发布会更顺`, `连接 X 账号`
- body: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/routes/connect/body.txt`
- screenshots: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/routes/connect/375.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/routes/connect/768.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/routes/connect/1024.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/routes/connect/1440.png`
- consoleErrors: none
- connect route redirects into the app task panel instead of exposing a dead page

### queue · `/queue?intent=confirm_publish`

- pass: `true`
- finalUrl: `http://127.0.0.1:3300/app?nextAction=confirm_publish`
- checkedCopy: `确认这条内容是否发出`, `当前待确认内容`
- body: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/routes/queue/body.txt`
- screenshots: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/routes/queue/375.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/routes/queue/768.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/routes/queue/1024.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/routes/queue/1440.png`
- consoleErrors: none
- queue route redirects into the app task panel instead of a separate backstage UI

### pricing · `/pricing`

- pass: `true`
- finalUrl: `http://127.0.0.1:3300/pricing`
- checkedCopy: `升级与结账`, `月付`
- body: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/routes/pricing/body.txt`
- screenshots: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/routes/pricing/375.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/routes/pricing/768.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/routes/pricing/1024.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/routes/pricing/1440.png`
- consoleErrors: none
- billing entry does not trigger real payment until the user clicks checkout
- checkout entry visible and not clicked: 开始 3 天试用

## Product-relevant baoyu matrix

| baoyu skill | status | DraftOrbit usage | test evidence | gap / remaining reason | repair result |
| --- | --- | --- | --- | --- | --- |
| `baoyu-url-to-markdown` | `runtime_integrated` | Clear user-provided URLs are captured as markdown sourceArtifacts before latest/source-required article generation. | `latest-hermes-agent-url-source` requires a ready `sourceArtifacts[].markdownPath` and rejects source-free latest-fact output. | No remaining product gap for explicit URL capture in the ordinary-user UAT scope. | Pinned runtime to audited upstream main and keeps source-ready assertions in the UAT script. |
| `baoyu-danger-x-to-markdown` | `runtime_integrated` | X/Twitter source URLs are routed through the baoyu source-capture runtime when the user supplies social-source evidence. | Source cases assert fail-closed behavior unless a captured markdown artifact is present; dangerous login/posting actions are not invoked. | Only capture/export is in scope; no reverse-engineered login flow is allowed in DraftOrbit. | Documented as safe source capture only, with latest/source ambiguity blocked for ordinary users. |
| `baoyu-format-markdown` | `rubric_or_prompt_reference` | Article readability and markdown hygiene are enforced through DraftOrbit result gates and ordinary-user copy assertions. | Article cases reject generic scaffold output, title repetition, method-framework title tone and prompt-wrapper leaks. | Not exposed as a separate user action; used as formatting/rubric parity rather than a standalone CLI button. | Report marks this as rubric parity, not falsely as a direct DraftOrbit runtime call. |
| `baoyu-imagine` | `runtime_integrated` | Visual plans produce prompt files and app-rendered SVG artifacts with baoyu runtime provenance while avoiding placeholder/mock images. | Tweet/thread/article cases require ready visualAssets, promptPath, template-svg renderer, app-rendered textLayer and no prompt leaks. | External image-provider keys may be absent locally; UAT treats mock/placeholder artifacts as failures for quality evidence. | Pinned runtime and ordinary-user UAT keep the provider/mock distinction explicit. |
| `baoyu-image-gen` | `rubric_or_prompt_reference` | Deprecated upstream alias is migrated to the `baoyu-imagine` provider seam; DraftOrbit does not call it as an active runtime entry. | Runtime smoke and UAT reports mark `baoyu-image-gen` as deprecated and require `baoyu-imagine` for actual visual generation. | `baoyu-image-gen` is deprecated/migrated to `baoyu-imagine`, so direct invocation would be stale product behavior. | Documented as deprecated alias only; active visual runtime uses `baoyu-imagine` plus local SVG rendering. |
| `baoyu-image-cards` | `rubric_or_prompt_reference` | Thread generation must produce a ready `cards` asset and responsive gallery evidence for ordinary users. | `thread-product-update` rejects runs missing a ready cards asset or leaking card number labels into visual cues. | The upstream skill is prompt/reference-oriented in this pin, so DraftOrbit validates card deliverables rather than calling a CLI. | Kept a hard UAT assertion for thread cards. |
| `baoyu-cover-image` | `rubric_or_prompt_reference` | Tweet and article outputs require cover-style visual artifacts with visible ordinary-user gallery state. | Visual UAT requires ready cover assets for article cases and visible “主视觉方向/图文资产” UI copy. | No separate cover-image CLI is invoked from DraftOrbit in this recovery pass. | Report identifies the gap as intentional product-surface consolidation. |
| `baoyu-infographic` | `rubric_or_prompt_reference` | Article outputs require a summary visual asset: infographic or illustration. | Article cases reject runs without a ready cover plus infographic/illustration asset. | No separate infographic CLI is invoked from the current ordinary-user UI. | Kept artifact-level assertion instead of adding an unplanned feature. |
| `baoyu-article-illustrator` | `rubric_or_prompt_reference` | Article result previews require a section visual path through illustration or infographic assets. | Article UAT accepts ready illustration/infographic evidence and rejects missing summary/section visuals. | Upstream exposes batch helper scripts, but DraftOrbit keeps article illustration behind its restored visual pipeline. | Documented as parity-through-artifact instead of direct CLI execution. |
| `baoyu-diagram` | `runtime_integrated` | Diagram intent and explicit diagram mode produce a standalone process/flow SVG asset with local renderer provenance. | Diagram prompts and visualRequest.mode=`diagram` are expected to produce a ready `diagram` asset with SVG metadata and quality-gate coverage. | Raster diagram providers remain optional; default pass uses safe local SVG diagrams rather than external services. | Added diagram to visual planning, renderer, parity matrix and ordinary-user UAT scope. |
| `baoyu-compress-image` | `safe_gap` | Current DraftOrbit can download generated assets but does not promise a separate compression workflow. | UAT checks “下载全部图文资产” state and leaves large image/provider artifacts local-only. | Compression is a future delivery hardening gap, not a restored active UI feature. | Kept out of runtime; report flags it for a future safe delivery pass. |
| `baoyu-markdown-to-html` | `runtime_integrated` | Article and export-enabled runs create Markdown and HTML files in the local artifact bundle with download links. | Article visualRequest.exportHtml requires markdown/html export assets and a signed bundle URL in the result preview. | No real CMS publish is performed; HTML is a local safe export package for manual reuse. | Integrated safe Markdown→HTML export artifacts into the visual pipeline and report matrix. |
| `baoyu-post-to-x` | `blocked_external_action` | DraftOrbit only prepares/queues/manual-confirms publish state; real X posting is blocked unless a safe explicit integration exists. | Tweet/thread UAT requires “连接 X 后才能发布” visibility and never executes a real post. | Real external posting and reverse-engineered login flows are intentionally out of scope for this local audit. | Kept as sandbox/manual publish-prep only and documented in the report matrix. |

## tweet-cold-start · tweet

- pass: `true`
- runId: `bfa31445-e178-4ddf-b2ce-f49e984d921f`
- prompt: 别再靠灵感写推文，给我一条更像真人的冷启动判断句。
- primaryModel: `codex-local/quick`
- routingTier: `quality_fallback`
- runtimeEngine: `baoyu-skills`
- visualAssetsReady: `1`
- visualAssetsFailed: `0`
- sourceStatus: `ready`
- sourcePass: `false`
- actionChecks: `download-svg:01-cover`, `download-bundle:zip`, `download-html:99-html`, `download-markdown:98-markdown`, `copy-markdown:toast`, `retry-ui:disabled-no-failed-assets`, `retry-assets-api:ok`
- screenshot: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/tweet-cold-start/app-result.png`
- responsive screenshots: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/tweet-cold-start/responsive-375.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/tweet-cold-start/responsive-768.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/tweet-cold-start/responsive-1024.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/tweet-cold-start/responsive-1440.png`
- finalJson: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/tweet-cold-start/final.json`

**Prompt leaks**

- none

**baoyu sync notes**

- baoyu 没有直接 tweet writer CLI；本 case 用 baoyu runtime visual artifacts + fixed/adversarial rubric 判定，不伪造 baoyu 文本直出。

## thread-product-update · thread

- pass: `true`
- runId: `9c3e92e4-ec43-4d6c-a27c-2027149138f9`
- prompt: 把一个 AI 产品新功能写成 4 条 thread，不要像建议模板。
- primaryModel: `codex-local/quick`
- routingTier: `quality_fallback`
- runtimeEngine: `baoyu-skills`
- visualAssetsReady: `4`
- visualAssetsFailed: `0`
- sourceStatus: `ready`
- sourcePass: `false`
- actionChecks: `download-svg:01-cover`, `download-bundle:zip`, `download-html:99-html`, `download-markdown:98-markdown`, `copy-markdown:toast`, `retry-ui:disabled-no-failed-assets`
- screenshot: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/thread-product-update/app-result.png`
- responsive screenshots: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/thread-product-update/responsive-375.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/thread-product-update/responsive-768.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/thread-product-update/responsive-1024.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/thread-product-update/responsive-1440.png`
- finalJson: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/thread-product-update/final.json`

**Prompt leaks**

- none

**baoyu sync notes**

- baoyu 没有直接 thread writer CLI；本 case 重点对照 thread/card 结构、visual prompt files 与 baoyu-imagine artifact。

## article-judgement-without-examples · article

- pass: `true`
- runId: `f6e2f4d1-c6c1-48d1-a04e-1755bf56a671`
- prompt: 写一篇关于 AI 内容全是判断没有例子的 X 长文，标题不要方法论味。
- primaryModel: `codex-local/quick`
- routingTier: `quality_fallback`
- runtimeEngine: `baoyu-skills`
- visualAssetsReady: `4`
- visualAssetsFailed: `0`
- sourceStatus: `ready`
- sourcePass: `false`
- actionChecks: `download-svg:01-cover`, `download-bundle:zip`, `download-html:99-html`, `download-markdown:98-markdown`, `copy-markdown:toast`, `retry-ui:disabled-no-failed-assets`
- screenshot: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/article-judgement-without-examples/app-result.png`
- responsive screenshots: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/article-judgement-without-examples/responsive-375.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/article-judgement-without-examples/responsive-768.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/article-judgement-without-examples/responsive-1024.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/article-judgement-without-examples/responsive-1440.png`
- finalJson: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/article-judgement-without-examples/final.json`

**Prompt leaks**

- none

**baoyu sync notes**

- baoyu 没有直接 article writer CLI；本 case 重点对照 article structure、markdown-style readability、cover/illustration/infographic artifact。

## article-generic-scaffold-gate · article

- pass: `true`
- runId: `e5976fb7-6cbd-49eb-857e-a9b53080025b`
- prompt: 写一篇关于 AI 内容全是判断没有例子的 X 长文，标题不要方法论味，也不要写成方法论大纲。
- primaryModel: `codex-local/quick`
- routingTier: `quality_fallback`
- runtimeEngine: `baoyu-skills`
- visualAssetsReady: `4`
- visualAssetsFailed: `0`
- sourceStatus: `ready`
- sourcePass: `false`
- actionChecks: `download-svg:01-cover`, `download-bundle:zip`, `download-html:99-html`, `download-markdown:98-markdown`, `copy-markdown:toast`, `retry-ui:disabled-no-failed-assets`
- screenshot: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/article-generic-scaffold-gate/app-result.png`
- responsive screenshots: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/article-generic-scaffold-gate/responsive-375.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/article-generic-scaffold-gate/responsive-768.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/article-generic-scaffold-gate/responsive-1024.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/article-generic-scaffold-gate/responsive-1440.png`
- finalJson: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/article-generic-scaffold-gate/final.json`

**Prompt leaks**

- none

**baoyu sync notes**

- quality-gate case：若模型仍输出 article_generic_scaffold，必须被拦截成用户可恢复失败态；若后端修复成功，则按正常 article artifact 验收。

## diagram-process-prompt · tweet

- pass: `true`
- runId: `5d06d825-bef6-4eca-92a0-f0f6991bf9ba`
- prompt: 用一条短推解释 DraftOrbit 从输入一句话到手动确认发布的 5 步流程，并配一个流程图：输入→来源→正文→图文→确认。
- primaryModel: `codex-local/quick`
- routingTier: `quality_fallback`
- runtimeEngine: `baoyu-skills`
- visualAssetsReady: `1`
- visualAssetsFailed: `0`
- sourceStatus: `ready`
- sourcePass: `false`
- actionChecks: `download-svg:01-diagram`, `download-bundle:zip`, `download-html:99-html`, `download-markdown:98-markdown`, `copy-markdown:toast`, `retry-ui:disabled-no-failed-assets`
- screenshot: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/diagram-process-prompt/app-result.png`
- responsive screenshots: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/diagram-process-prompt/responsive-375.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/diagram-process-prompt/responsive-768.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/diagram-process-prompt/responsive-1024.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/diagram-process-prompt/responsive-1440.png`
- finalJson: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/diagram-process-prompt/final.json`

**Prompt leaks**

- none

**baoyu sync notes**

- diagram case：对标 baoyu-diagram / visual flow 能力，必须产出 diagram SVG 与 Markdown/HTML 导出资产。

## latest-hermes-source · article

- pass: `true`
- runId: `166bae26-d252-482c-ac9c-f4ee37e0277b`
- prompt: 生成关于最新的 Hermes 的文章
- primaryModel: `source-blocked`
- routingTier: `source-blocked`
- runtimeEngine: `source-blocked`
- visualAssetsReady: `0`
- visualAssetsFailed: `0`
- sourceStatus: `not_configured`
- sourcePass: `true`
- screenshot: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/latest-hermes-source/app-result.png`
- finalJson: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/latest-hermes-source/final.json`

**Prompt leaks**

- none

**baoyu sync notes**

- source case：若 Tavily 与 baoyu URL 抓取可用，必须进入 sourceArtifacts；若 Hermes 歧义或搜索未配置，必须 fail-closed 并显示“需要可靠来源”。
- source failed but correctly blocked

## latest-hermes-agent-url-source · article

- pass: `true`
- runId: `08924444-d15b-4500-a58a-b854380fb9f9`
- prompt: 根据这篇来源写一篇关于最新 Hermes Agent 的 X 长文：https://tech.ifeng.com/c/8sDHJq3vKxM
- primaryModel: `codex-local/quick`
- routingTier: `quality_fallback`
- runtimeEngine: `baoyu-skills`
- visualAssetsReady: `4`
- visualAssetsFailed: `0`
- sourceStatus: `ready`
- sourcePass: `true`
- actionChecks: `download-svg:01-cover`, `download-bundle:zip`, `download-html:99-html`, `download-markdown:98-markdown`, `copy-markdown:toast`, `retry-ui:disabled-no-failed-assets`
- screenshot: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/latest-hermes-agent-url-source/app-result.png`
- responsive screenshots: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/latest-hermes-agent-url-source/responsive-375.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/latest-hermes-agent-url-source/responsive-768.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/latest-hermes-agent-url-source/responsive-1024.png`, `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/latest-hermes-agent-url-source/responsive-1440.png`
- finalJson: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-20_04-17-31/latest-hermes-agent-url-source/final.json`

**Prompt leaks**

- none

**baoyu sync notes**

- source-ready case：用户已给出明确 URL 时，必须先用 baoyu-url-to-markdown 抓成 markdown source artifact，再进入文章与图文资产生成。
