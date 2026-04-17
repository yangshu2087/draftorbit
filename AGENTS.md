# DraftOrbit Repository Guide

## Purpose

- This repository is a pnpm / Turborepo monorepo with the production web app under `apps/web`, backend services under `apps/api`, and shared contracts under `packages/shared`.
- Treat the git root as the source of truth for branch history, release scripts, and cross-app coordination.
- Treat `apps/web/` as the primary front-end implementation surface.

## Working rules

- Before changing code, classify the task as one of:
  - front-end work inside `apps/web/`
  - API / backend work inside `apps/api/`
  - shared contract work inside `packages/shared/`
  - release or verification work under `scripts/`
- For front-end work, read in this order before editing:
  1. `DESIGN.md`
  2. `apps/web/AGENTS.md`
  3. `apps/web/DESIGN.md`
  4. `apps/web/design/README.md`
  5. `apps/web/design/design-system.md`
  6. `apps/web/docs/ui-acceptance-checklist.md`
  7. `docs/agent-handoff.md`
- Keep UI-only changes inside `apps/web/` unless the task truly requires `apps/api/` or `packages/shared/` changes.
- If a UI task requires changes outside `apps/web/`, document the dependency or reason in the handoff or PR summary.
- Store checked-in front-end design intent under `apps/web/design/` so Codex, Cursor, and humans can share the same source artifacts.
- Because this repo often has unrelated dirty files, prefer path-scoped git inspection for UI work such as `git status --short -- apps/web` and `git diff --stat -- apps/web`.
- Use short-lived branches for meaningful changes and avoid direct pushes to `main`.
- Prefer the local wrapper `./scripts/handoff-refresh.sh` to refresh `docs/agent-handoff.md` without overwriting the human summary sections.

## Front-end workflow

- `apps/web/app/` owns routes, layouts, metadata, and page-level composition.
- `apps/web/components/` owns reusable UI primitives plus feature sections.
- `apps/web/lib/` owns view helpers, query wiring, and client-side UI utilities.
- `apps/web/test/` owns narrow web verification for UI logic.
- For UI tasks, use this loop:
  1. read the design sources listed above
  2. identify the narrowest owner path under `apps/web/`
  3. implement with existing tokens/components before adding new ones
  4. run narrow web checks
  5. run browser verification when layout or interaction changed
  6. refresh `docs/agent-handoff.md` before pausing

## Verification

- From the repo root, prefer narrow web verification first:
  - `pnpm --filter @draftorbit/web lint`
  - `pnpm --filter @draftorbit/web test`
  - `pnpm --filter @draftorbit/web build`
- From `apps/web/`, the equivalent commands are:
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build`
  - `pnpm ui:review`
- Only escalate to repo-wide smoke or UAT scripts when the task changes a full flow beyond the web package boundary.
- Before calling UI work complete, document which design inputs were used, which breakpoints were checked, and any remaining visual gaps.

## DESIGN.md workflow

- Keep repository-level `DESIGN.md` as the source of truth for look-and-feel constraints used by AI agents.
- For front-end tasks, read `DESIGN.md` before implementation and follow its token, component, state, and responsive rules.
- If the repo has a web app (for example `web/` or `apps/web/`), also read that web app's `DESIGN.md` and `docs/ui-acceptance-checklist.md`.
- Do not clone third-party brand styles directly from public references; adapt with project-approved tokens and product intent.
- Before finalizing UI work, run narrow code checks and at least one browser visual verification pass.
