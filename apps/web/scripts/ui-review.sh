#!/usr/bin/env bash
set -euo pipefail

echo "[ui-review] Running narrow UI verification from apps/web/..."
pnpm lint
pnpm test

echo "[ui-review] Refreshing shared handoff file..."
bash ../../scripts/handoff-refresh.sh --verify "git status --short -- apps/web"

cat <<'EOF'
[ui-review] Next manual checks:
- Review apps/web/docs/ui-acceptance-checklist.md
- Verify the changed UI in a browser when the task affects layout or interaction
- Check 375 / 768 / 1024 / 1440 widths when responsive behavior matters
EOF
