# DESIGN.md (Web)

> Web UI design contract for agent-driven implementation.

## Visual direction

- Feel: trustworthy, product-grade, readable
- Avoid: random style drift, one-off values, unverified visual changes

## Tokens and components

- Prefer existing theme variables, Tailwind/shadcn tokens, and shared components.
- Add new tokens/components only when reuse is impossible.

## Required UI states

- loading
- empty
- error
- hover
- focus-visible
- active/disabled where relevant

## Responsive baseline

- Verify at 375 / 768 / 1024 / 1440
- Avoid accidental horizontal scrolling
- Keep CTA placement and information hierarchy stable

## Accessibility baseline

- semantic structure first
- keyboard reachability
- visible focus states
- acceptable contrast for content and controls

## Agent workflow

1. Read this file and the repo root `DESIGN.md`
2. Implement with existing tokens/components
3. Run narrow code checks
4. Run browser visual checks
5. Summarize what is verified and what remains unverified

---

Last updated: 2026-04-04
