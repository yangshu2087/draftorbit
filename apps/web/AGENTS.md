# DraftOrbit Web Front-end Guide

## Purpose

- `apps/web/` is the production Next.js front-end for DraftOrbit.
- Optimize for trustworthy, operator-friendly product UI rather than generic AI-demo styling.

## Read order

Before continuing existing UI work, read these files in order:

1. `../../AGENTS.md`
2. `../../DESIGN.md`
3. `AGENTS.md`
4. `DESIGN.md`
5. `design/README.md`
6. `design/design-system.md`
7. `docs/ui-acceptance-checklist.md`
8. `../../docs/agent-handoff.md`

## Working rules

- Prefer the existing stack:
  - Next.js App Router under `app/`
  - Tailwind CSS
  - Radix primitives + class-variance-authority composition
  - TanStack Query for client data flows
  - shared contracts from `@draftorbit/shared`
- Keep route, layout, metadata, and page-level composition changes in `app/`.
- Keep reusable UI and feature sections in `components/`.
- Keep browser-side helpers, queries, and UI utilities in `lib/`.
- Keep narrow UI logic checks in `test/`.
- Store Figma links in `design/figma-links.md` and keep screenshots, Stitch/AI Studio exports, and design notes under `design/`.
- Reuse existing tokens, components, and layout patterns before introducing one-off markup or ad hoc classes.
- If you use external inspiration, translate it into local tokens/components and record the chosen references in `design/README.md` or `../../docs/agent-handoff.md`.
- Treat visual states as part of the implementation:
  - loading
  - empty
  - error
  - hover
  - focus-visible
  - disabled
- For responsive UI work, check at 375, 768, 1024, and 1440 widths when feasible.
- Use `../../scripts/handoff-refresh.sh` before pausing when design work is in progress.
- For regular UI review, prefer `pnpm ui:review` so lint, tests, and handoff refresh stay aligned.

## Verification

- Run the smallest useful web verification from `apps/web/`:
  - `pnpm lint` for most component and style edits
  - `pnpm test` when UI logic or helpers changed
  - `pnpm ui:browser -- --url <url>` for standalone real browser verification
  - `pnpm build` when routes, layouts, metadata, or rendering boundaries changed
  - `pnpm ui:review -- --url <url>` for the default lint + test + browser + handoff path
- If the change is visual, prefer browser verification over static code inspection alone.
- If browser verification is skipped, state the gap explicitly in the handoff or PR summary.

## Completion standard

Before declaring UI work done, summarize:

1. what design inputs were used
2. what external inspirations were used, if any
3. which states and breakpoints were checked
4. what remains visually unverified

## DESIGN.md workflow

- Keep repository-level `DESIGN.md` as the source of truth for look-and-feel constraints used by AI agents.
- For front-end tasks, read `DESIGN.md` before implementation and follow its token, component, state, and responsive rules.
- If the repo has a web app (for example `web/` or `apps/web/`), also read that web app's `DESIGN.md` and `docs/ui-acceptance-checklist.md`.
- Do not clone third-party brand styles directly from public references; adapt with project-approved tokens and product intent.
- Before finalizing UI work, run narrow code checks and at least one browser visual verification pass.
