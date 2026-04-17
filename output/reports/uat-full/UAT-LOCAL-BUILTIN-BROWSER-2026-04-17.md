
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
