# Workspace Design Language

This `DESIGN.md` is the team-level design source of truth for Codex work in this workspace.

It is intentionally not a copy of any one brand.  
It is a synthesis of the approved reference set in [`docs/design-reference-shortlist.md`](/Users/yangshu/Codex/docs/design-reference-shortlist.md), with the strongest influence coming from:

- Vercel
- Linear
- Stripe
- Notion
- Mintlify

The target default is: **developer-tool SaaS with precise hierarchy, restrained surfaces, strong readability, and reusable component logic**.

## 1. Visual Theme & Atmosphere

The default visual mood should feel:

- calm
- engineered
- trustworthy
- modern
- readable under long use

Prefer **light-first public surfaces**:

- marketing pages
- pricing pages
- docs pages
- onboarding flows

Use **dark product shells** only when they help dense logged-in workflows:

- dashboards
- lists and detail panes
- settings
- command-heavy product views

Do not mix multiple strong visual worlds on the same page.  
Choose one dominant mode and keep the rest supportive.

## 2. Color Palette & Roles

### Core neutrals

- **Ink 900** `#171717`: primary headings, strong text, dark iconography
- **Ink 700** `#4d4d4d`: secondary text, helper copy
- **Ink 500** `#666666`: tertiary text, muted labels
- **Ink 300** `#808080`: placeholders, disabled text
- **Canvas** `#ffffff`: page background, major card surface
- **Surface 50** `#fafafa`: subtle alternate surface
- **Border** `#ebebeb`: dividers, input outlines, card edges

### Primary interactive colors

- **Action Blue** `#0a72ef`: primary action, selected state, key links
- **Focus Blue** `#0072f5`: focus ring, accessibility-visible interaction
- **Success Green** `#15be53`: success state, positive metric, completion cue
- **Warning Amber** `#c37d0d`: warning and caution
- **Danger Rose** `#cf2d56`: error and destructive state

### Reserved accent colors

- **Accent Indigo** `#5e6ad2`: allowed for AI / automation / active-navigation moments
- **Accent Violet** `#7170ff`: allowed sparingly in dark authenticated product shells

Rule:

- On any one screen, use **one dominant chromatic accent**.
- Secondary accent colors should appear only as small support signals, not as competing primaries.

## 3. Typography Rules

### Font families

Use the repository-native font stack if one already exists.  
If no strong existing stack exists, prefer:

- **Sans**: `Geist Sans`, then `Inter`, then system fallback
- **Mono**: `Geist Mono`, `Berkeley Mono`, or `ui-monospace`

Avoid defaulting to generic Arial/system-only output when a more intentional stack already exists.

### Hierarchy

- **Display / Hero**: `48px-64px`, weight `600`, tight line height, negative tracking only when visually justified
- **H1 / Section Headings**: `36px-48px`, weight `600`
- **H2 / Subsections**: `28px-36px`, weight `600`
- **H3 / Card Titles**: `20px-24px`, weight `600`
- **Body**: `16px-18px`, line-height `1.5-1.7`
- **Small UI / Meta**: `12px-14px`, weight `500`
- **Code / Technical Labels**: monospace, small, high-contrast, sparse use

Typography should feel compressed and intentional in headlines, but relaxed and highly legible in body text.

## 4. Component Stylings

### Buttons

- Default height: `40px-44px`
- Radius: `10px-12px`
- Primary button: solid accent fill
- Secondary button: neutral surface + subtle border
- Tertiary button: text-first, low visual weight

Use full-pill radius only for:

- badges
- segmented pills
- small filter chips

### Cards

- Radius: `12px-16px`
- Prefer border-first depth over heavy shadow
- Use generous internal padding
- Keep card content structured: title, supporting text, actions, status

### Inputs and forms

- Height: `40px-44px`
- Border: subtle by default, stronger on hover/focus
- Focus state must be visible and consistent
- Labels should stay readable, never too faint

### Navigation

- Clear active state
- Strong hierarchy over decoration
- Minimal chrome
- In dark shells, keep contrast high without neon excess

## 5. Layout Principles

- Use an `8px` spacing base
- Prefer generous whitespace on public pages
- Prefer tighter but still breathable density in logged-in product areas
- Keep marketing widths around `1200px-1280px`
- Keep reading content around `720px-840px`
- Avoid cramming too many unrelated visual motifs into one section

For public surfaces:

- prioritize rhythm
- visual grouping
- scroll clarity

For authenticated product surfaces:

- prioritize scannability
- alignment
- fast task execution

## 6. Depth & Elevation

Default rule: **border first, shadow second**.

Preferred depth system:

- subtle border on most surfaces
- micro-shadow only when a surface genuinely needs lift
- stronger elevation only for dialogs, popovers, or featured cards

Avoid:

- muddy multi-color shadows
- oversized glassmorphism
- large blurred glows as a default pattern

## 7. Do's and Don'ts

### Do

- reuse existing tokens and components
- keep hierarchy obvious
- verify hover, focus, loading, empty, error, and disabled states
- match the repo's real design system before introducing new primitives
- choose a small number of strong ideas and apply them consistently

### Don't

- clone third-party brand styles verbatim
- mix Vercel minimalism, Cursor warmth, and Stripe luxury on one page
- use multiple loud accent colors on the same screen
- overuse gradients, glow, blur, or oversized animations
- hide important structure behind stylistic flourishes

## 8. Responsive Behavior

Default verification widths:

- `375`
- `768`
- `1024`
- `1440`

Rules:

- mobile first for public flows
- no clipped copy
- no broken CTA alignment
- no hidden states that exist only on desktop
- preserve hierarchy rather than pixel identity when adapting across sizes

## 9. Agent Prompt Guide

When Codex works on front-end tasks in this workspace, it should:

1. read this `DESIGN.md` first
2. read [`docs/design-reference-shortlist.md`](/Users/yangshu/Codex/docs/design-reference-shortlist.md) if external inspiration is useful
3. explicitly state which 1-2 references are relevant for the current task
4. translate those references into repo-native tokens, components, and patterns
5. verify at least one real browser or visual pass before claiming completion

Prompting rule:

- treat external references as **design-language input**
- never treat them as **brand-cloning instructions**
