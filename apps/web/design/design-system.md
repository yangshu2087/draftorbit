# DraftOrbit Web Design System Notes

Use these rules to keep the UI coherent while still moving quickly.

## Product feel

- The product should feel trustworthy, operational, and product-grade rather than flashy or experimental.
- Prioritize clarity of task flow, result readability, and calm hierarchy over decorative complexity.

## Layout

- Prefer a stable app shell with a clear page header, primary action area, and section rhythm.
- Use 4/8-based spacing steps by default.
- Let important task or billing information breathe; do not compress cards, tables, or forms just to fit more above the fold.

## Typography

- Keep hierarchy obvious between page titles, section headers, status labels, helper text, and empty-state messaging.
- Avoid tiny text as a layout escape hatch.
- Preserve readable line lengths in onboarding, billing, and result-oriented flows.

## Components

- Prefer existing UI components and shared local patterns before inventing one-off wrappers.
- Keep forms, dialogs, tabs, and result panels visually consistent.
- Make interactive affordances obvious without creating visual noise.

## Color and token usage

- Prefer repo tokens, theme variables, and existing Tailwind patterns over hard-coded values.
- Use accent colors intentionally for CTA emphasis and status signals.
- Ensure important task outcomes, pricing, and action text remain high contrast.

## States

- Every data-backed or action-backed surface should have a considered loading, empty, and error state.
- Interactive controls should have visible hover and focus-visible treatment.
- Disabled states should look unavailable, not broken.

## Responsive behavior

- Verify at 375, 768, 1024, and 1440 widths unless the task clearly targets a different range.
- Avoid accidental horizontal scroll.
- Preserve action hierarchy and status readability when content wraps.

## Accessibility

- Prefer semantic HTML and labeled controls.
- Keep keyboard navigation and focus visibility intact.
- Avoid color-only communication for status or warning signals.

## Verification expectation

- Browser verification is preferred for meaningful UI work.
- “Build passes” is not enough for front-end completion.
