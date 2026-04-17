# DraftOrbit vendored runtime checkouts

`vendor/baoyu-skills/` is a local, ignored checkout used by the baoyu-compatible
runtime path. It is intentionally not committed because the upstream skill repo
contains its own nested scripts and lockfiles.

Prepare it with:

```bash
node scripts/ensure-baoyu-skills-runtime.mjs
```

The expected upstream revision is pinned in the script and in
`apps/api/src/modules/generate/baoyu-runtime.service.ts`.
