# DESIGN.md

> Design contract for AI-assisted front-end implementation.

## 1) Visual Theme & Atmosphere

- Product mood: pragmatic, trustworthy, product-focused
- Density: medium
- Tone: clear, calm, technical
- Brand personality keywords: clarity, consistency, reliability

## 2) Color Palette & Roles

| Token | Value | Role |
|---|---|---|
| `--color-bg-page` | `#0b1020` | page background |
| `--color-bg-surface` | `#11172a` | cards/panels |
| `--color-text-primary` | `#f8fafc` | primary text |
| `--color-text-secondary` | `#cbd5e1` | secondary text |
| `--color-border` | `#263247` | default border |
| `--color-brand` | `#4f46e5` | primary CTA/accent |
| `--color-success` | `#22c55e` | success state |
| `--color-warning` | `#f59e0b` | warning state |
| `--color-danger` | `#ef4444` | error/destructive |

## 3) Typography Rules

- Heading font: project standard sans
- Body font: project standard sans
- Mono font: project standard mono
- Scale: 12/14/16/18/20/24/30
- Weight policy: 400 body, 500 UI, 600 headings

## 4) Component Stylings

- Buttons: consistent radius + token colors + clear focus states
- Inputs/forms: tokenized borders/backgrounds, explicit error/help states
- Cards/panels: tokenized surfaces, borders/shadows, predictable spacing
- Navigation: clear active state, keyboard friendly, responsive collapse
- Data tables/lists: readable row density, clear alignment, stable headers

## 5) Layout Principles

- Spacing scale: 4/8-based
- Container/grid: container + responsive columns, avoid accidental overflow
- Radius policy: small set of radius tokens only
- Whitespace philosophy: favor readability and stable hierarchy

## 6) Depth & Elevation

- Border/shadow system: use tokenized border/shadow layers, avoid arbitrary shadows
- Focus treatment: visible focus ring and keyboard-visible states

## 7) Do's and Don'ts

### Do
- Reuse tokens/components before adding one-off values.
- Keep loading, empty, error, hover, focus-visible, and disabled states complete.
- Keep responsive behavior explicit.

### Don't
- Don't copy brand palettes/typography from third-party websites without product decision.
- Don't ship visual changes that were never verified in a browser.
- Don't introduce inconsistent spacing/typography “exceptions” without documenting why.

## 8) Responsive Behavior

- Required checks: 375 / 768 / 1024 / 1440 widths
- Collapse strategy: stack and collapse without losing action hierarchy

## 9) Agent Prompt Guide

Use this for implementation prompts:

- "Read `DESIGN.md` first, then implement this UI with tokenized values and complete states (loading/empty/error/hover/focus/disabled)."
- "Before completion, verify in browser at 375/768/1024/1440 and summarize visual gaps."

## 10) Project-specific constraints

- Framework/UI stack: document each project stack in this section
- Accessibility baseline: semantic HTML + keyboard nav + visible focus + acceptable contrast
- Verification baseline: run the narrowest lint/test/build + browser validation for UI changes

---

Last updated: 2026-04-04
