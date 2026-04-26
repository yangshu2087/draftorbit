# DraftOrbit Project Ops Workbench UAT — 2026-04-25

## Scope

- Branch: `codex/project-ops-workbench-skilltrust-preset`
- Worktree: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio`
- Goal: verify the new project-based X operations workbench while preserving the existing `/app` generation flow.

## Product contract checked

- `/app` remains the one-off X thread / visual generation entry.
- `/projects` adds project context without exposing model routing internals to ordinary users.
- Supported project presets:
  - `generic_x_ops`
  - `skilltrust_x_ops`
- SkillTrust preset includes: `审计演示`, `风险教育`, `工作流方法`, `发布日志`, `数据洞察`.
- Publishing boundary stays manual: no real X posting, no auto schedule, no payment execution.

## Backend/API evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Health | Pass | `GET /health` -> `200`, `ready=true`, `db=true`, `redis=true` |
| Protected projects route | Pass | `GET /v3/projects` without auth -> `401 UNAUTHORIZED` |
| Create SkillTrust project | Pass | `POST /v3/projects` with local token created `SkillTrust 推特/X 运营 UAT` |
| Project detail | Pass | `GET /v3/projects/:id` returned pillars and zero initial runs |
| API contract | Pass | New routes are under protected `/v3/projects*`; existing `/v3/chat/run` remains compatible and accepts optional `contentProjectId` |
| Data consistency | Pass | `Generation.contentProjectId` relation added; large assets stay in artifact roots; project metadata stores only compact playbook/checklist settings |

Temporary local evidence files:

- `/tmp/draftorbit-health-project-ops.json`
- `/tmp/draftorbit-project-create-uat.json`
- `/tmp/draftorbit-project-detail-uat.json`
- `/tmp/draftorbit-projects-unauth.json`

## Frontend/browser evidence

| Route / flow | Result | Evidence |
| --- | --- | --- |
| `/app` project entry | Pass | Playwright CI opens `/app`, sees `项目运营工作台`, and navigates to `/projects` |
| `/projects` preset creation | Pass | Playwright CI creates SkillTrust preset and verifies project detail copy |
| project generation | Pass | Playwright CI starts linked project run, hydrates result, shows bundle + queue link |
| local real page screenshot | Pass | Screenshot below, console errors `0` |

Screenshot:

- `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio/output/playwright/manual-check/project-ops-skilltrust-2026-04-25.png`

## Automated verification summary

- `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 db:generate` — Pass
- `DATABASE_URL=postgresql://draftorbit:draftorbit@localhost:5433/draftorbit npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 db:push` — Pass for local UAT schema sync
- `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api test` — Pass, `259/259`
- `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api typecheck` — Pass
- `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web typecheck` — Pass
- `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web test` — Pass, node tests `36/36`, Playwright `6/6`, harness `9.21s`
- `NEXT_PUBLIC_API_URL=http://127.0.0.1:4311 npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web build` — Pass, `/projects` included in static routes

## Remaining non-goals / safety boundary

- No real X posting was executed.
- No real OAuth final grant was completed.
- No real payment or scheduling action was executed.
- SkillTrust preset is a reusable local project template, not the only supported business case.
