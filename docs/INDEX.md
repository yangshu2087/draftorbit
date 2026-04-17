# DraftOrbit Documentation Index

## Canonical docs

- `README.md`: project overview and setup entrypoint.
- `AGENTS.md`: agent working rules for this project.
- `DESIGN.md`: high-level design notes retained at the project root.
- `RECOVERY-SOURCE.md`: recovery provenance for the current restored tree and branch.

## Product and architecture

- `docs/v2-product-spec.md`
- `docs/v2-ux-flow.md`
- `docs/v2-cost-margin-model.md`
- `docs/v2-retrospective-2026-04-07.md`
- `docs/v3-status-review-2026-04-08.md`

## Operations

- `docs/operations/`: operational setup and integration notes, including Stripe setup docs.

## Recovery and historical path evidence

- `docs/recovery/RECOVERY.md`: restore and backup procedure for this recovered project.
- `docs/recovery/project-entry.md`: fast project entry document for new sessions.
- `docs/recovery/knowledge-recovery-2026-04-08.md`: complete historical recovery notes; may contain legacy AI_SSD references.
- `docs/recovery/path-index-reconciliation-checklist-2026-04-08.md`: historical path reconciliation notes.

## Reports and local evidence

- `output/reports/audit/`: audit reports.
- `output/reports/billing/`: billing and payment test reports.
- `output/reports/uat-full/`: full UAT and benchmark Markdown reports.
- `output/reports/hermes/`: Hermes-generated project reports when explicitly requested.
- `artifacts/`: local-only machine outputs, JSON, screenshots, runtime visual assets, and benchmark evidence.
- `output/playwright/`: local-only browser screenshots and Playwright evidence.

Large runtime evidence is intentionally ignored from git by default; see `RECOVERY-SOURCE.md`.
