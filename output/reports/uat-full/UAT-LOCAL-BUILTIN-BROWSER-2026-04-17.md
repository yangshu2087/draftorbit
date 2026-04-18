
## Session 2026-04-17 03:56:24 PDT — built-in browser + local core flow

### Scope
- Entry from `/` via **本机快速体验**.
- Core user paths: generation, export evidence, queue, connect, pricing.
- Environment: local Web `http://127.0.0.1:3300`, local API `http://127.0.0.1:4311`.

### Step-by-step verification

| Step | Action | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Home page keyboard focus to **本机快速体验** and press Enter | ✅ Entered `/app` successfully | Built-in browser snapshot `uid=4_0`, URL `http://127.0.0.1:3300/app`, loader copy `正在加载生成器` |
| 2 | In `/app`, input minimal prompt and start generation | ✅ Generation pipeline started and progressed | Snapshot shows `runId: 74433cc4...`, stage text advanced through `正在生成草稿` → `正在匹配你的文风` → `正在准备可发布结果` |
| 3 | Open queue path `/queue?intent=confirm_publish` | ✅ Redirected to `/app?nextAction=confirm_publish` and displayed review gate | Snapshot `uid=17_0`: heading `确认这条内容是否发出`, visible `当前待确认内容`, button `确认发布` |
| 4 | Open connect path `/connect?intent=connect_x_self` | ✅ Redirected to `/app?nextAction=connect_x_self` and displayed safe connect gate | Snapshot `uid=18_0`: heading `连接 X 账号后再发布会更顺`, button `连接 X 账号` |
| 5 | Open `/pricing` | ✅ Pricing and billing plans loaded | Snapshot `uid=19_0` + network `GET /v3/billing/plans [200]` |
| 6 | Export flow evidence (automation supplement) | ✅ Export-related core scenario passed | `pnpm --filter @draftorbit/web test` passed; includes scenario `app generation covers article and diagram visual outputs...` with assertions for `导出 HTML` and bundle/export actions |

### Additional notes
- Home page X-login path still surfaces environment issue when using X auth CTA:
  - UI message: `Missing required env: X_CALLBACK_URL`
  - Network evidence seen in prior home-page check: `GET /auth/x/authorize [500]`
- This does **not** block local ordinary-user path via **本机快速体验** and `/app` core flow.

### Automated command evidence captured in this session

```bash
npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web test
```

Observed result:
- `4 passed (5.3s)`
- `Web Playwright CI harness finished in 5.87s`
- Contains generation + export + queue/connect/pricing coverage in `apps/web/e2e/ordinary-user-ci.spec.ts`.



## Session 2026-04-17 04:15:46 PDT — X_CALLBACK_URL configured + X 登录入口 UAT (live local)

### Scope
- Validate X login entry after explicitly providing `X_CALLBACK_URL`.
- Keep local-first environment and avoid real post/payment actions.

### Runtime configuration used
- API launch env (local):
  - `PORT=4311`
  - `APP_URL=http://127.0.0.1:3300`
  - `AUTH_MODE=self_host_no_login`
  - `DATABASE_URL=postgresql://draftorbit:draftorbit@localhost:5433/draftorbit`
  - `REDIS_URL=redis://localhost:6379`
  - `JWT_SECRET=dev-local-secret`
  - `X_CLIENT_ID=local-ci-x-client`
  - `X_CLIENT_SECRET=local-ci-x-secret`
  - `X_CALLBACK_URL=http://127.0.0.1:3300/auth/callback`
- Web launch mode for stable UAT:
  - `next build` then `next start --hostname 127.0.0.1 --port 3300`
  - `NEXT_PUBLIC_API_URL=http://127.0.0.1:4311`
  - `NEXT_PUBLIC_ENABLE_LOCAL_LOGIN=true`

### X 登录入口结果

| Step | Action | Result | Evidence |
| --- | --- | --- | --- |
| 1 | API contract probe `GET /auth/x/authorize?intent=connect_x_self` | ✅ 200 JSON returned, no env-missing failure | Response body includes authorize URL with `redirect_uri=http%3A%2F%2F127.0.0.1%3A3300%2Fauth%2Fcallback`; requestId observed |
| 2 | Real browser UAT: open `/`, click **用 X 登录开始** | ✅ Request succeeded and browser navigated to X OAuth authorize page | `/tmp/x-login-uat-result.json`: `requestStatus: 200`, `requestUrl: http://127.0.0.1:4311/auth/x/authorize`, `finalPageUrl: https://x.com/i/oauth2/authorize...` |
| 3 | Regression check for previous failure copy | ✅ No `Missing required env: X_CALLBACK_URL` shown | `/tmp/x-login-uat-result.json`: `missingEnvVisible: false` |
| 4 | Visual evidence | ✅ Screenshot captured during OAuth entry flow | `output/playwright/x-login-entry-uat-2026-04-17.png` (ignored artifact) |

### Notes
- This pass validates **X 登录入口可拉起** and callback wiring presence in authorize URL.
- Real X account authorization completion is intentionally out of scope in local safety policy.

## Session 2026-04-18 07:08 PDT — built-in browser full-flow rerun + diagram gate fix

### Scope
- Worktree: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability`
- Objective: rerun ordinary-user full flow (`/` → `/app` → generation/export → `/queue`/`/connect`/`/pricing`) and verify X 登录入口 after `X_CALLBACK_URL` wiring, then directly fix blockers.
- Runtime: API `http://127.0.0.1:4311` (with `X_CALLBACK_URL=http://127.0.0.1:3300/auth/callback`), Web `http://127.0.0.1:3300` (`next build` + `next start`).

### Blocker found and direct fix

| Item | Problem | Direct fix | Regression evidence |
| --- | --- | --- | --- |
| Diagram tweet intent in ordinary-user flow | `diagram-process-prompt` was blocked by `missing_scene` quality hard-fail, causing diagram visual asset generation to fail closed even when user explicitly requested a process diagram. | Updated `apps/api/src/modules/generate/content-quality-gate.ts`: detect diagram intent from `visualPlan`/focus/text cues and skip `missing_scene` hard-fail for tweet diagram intent. | Added test in `apps/api/test/content-quality-gate.test.ts`: `buildContentQualityGate allows diagram-intent tweet prompts without missing_scene hard fail`; API suite now passes with this regression covered. |

### Built-in browser / visual verification results

| Step | Action | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Click **用 X 登录开始** on `/` | ✅ redirected to X OAuth authorize entry with callback present | `output/playwright/x-login-uat-result-2026-04-18-14-07-09.json` (`finalUrl` is `https://x.com/i/oauth2/authorize...redirect_uri=http%3A%2F%2F127.0.0.1%3A3300%2Fauth%2Fcallback`), screenshot `output/playwright/x-login-entry-uat-2026-04-18-14-07-09.png` |
| 2 | Browser full-path check from `/` to `/app`, then `/queue` `/connect` `/pricing` | ✅ route entry/redirect/CTA visibility verified | `output/playwright/local-full-flow-2026-04-18-14-07-46/full-flow-report.json` and step screenshots `01-home.png`…`06-pricing.png` |
| 3 | Ordinary-user full UAT matrix rerun (tweet/thread/article/diagram/URL source/latest fail-closed + route audit + export actions) | ✅ all pass (`7/7` cases, route audit `5/5`) | `output/reports/uat-full/BAOYU-ORDINARY-USER-SYNC-2026-04-18_06-48-53.md`, artifact root `output/playwright/ordinary-user-baoyu-sync-2026-04-18_06-48-53/` |

### Notes
- This pass keeps safety boundaries unchanged: no real post to X, no real payment execution, no dangerous login automation.
- X 登录入口 verification only checks **authorize entry availability + callback wiring + no env-missing error**.
