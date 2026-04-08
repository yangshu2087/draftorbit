#!/usr/bin/env bash
set -euo pipefail

browser_log="$(mktemp)"
cleanup() {
  rm -f "$browser_log"
}
trap cleanup EXIT

echo "[ui-review] Running narrow UI verification from apps/web/..."
pnpm lint
pnpm test

echo "[ui-review] Running real browser verification..."
if bash ./scripts/ui-browser-verify.sh "$@" | tee "$browser_log"; then
  browser_summary="$(grep '^SUMMARY:' "$browser_log" | tail -n1 | sed 's/^SUMMARY: //')"
else
  status=$?
  browser_summary="$(grep '^SUMMARY:' "$browser_log" | tail -n1 | sed 's/^SUMMARY: //' || true)"
  if [[ -z "$browser_summary" ]]; then
    browser_summary="browser verification failed (exit $status); start the dev server, pass --url / UI_REVIEW_URL, or set UI_REVIEW_SKIP_BROWSER=1 to bypass intentionally"
  fi
  echo "[ui-review] Refreshing shared handoff file after browser failure..."
  bash ../../scripts/handoff-refresh.sh --verify "git status --short -- apps/web" --note "$browser_summary"
  exit "$status"
fi

echo "[ui-review] Refreshing shared handoff file..."
bash ../../scripts/handoff-refresh.sh --verify "git status --short -- apps/web" --note "$browser_summary"

cat <<'EOF'
[ui-review] Completed:
- lint + test ran
- real browser verification ran
- handoff refreshed
EOF
