#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash ./scripts/ui-browser-verify.sh [--url URL] [--expect-title SUBSTRING] [--artifact-dir PATH] [--skip-screenshots]

Env:
  UI_REVIEW_URL              Browser target URL (default: http://127.0.0.1:${UI_REVIEW_PORT:-3000})
  UI_REVIEW_EXPECT_TITLE     Expected title substring (default: DraftOrbit)
  UI_REVIEW_ARTIFACT_DIR     Directory for screenshots/errors (default: temp dir)
  UI_REVIEW_SKIP_SCREENSHOTS Set to 1 to avoid saving screenshots
  UI_REVIEW_SKIP_BROWSER     Set to 1 to skip browser verification entirely
EOF
}

url="${UI_REVIEW_URL:-}"
expect_title="${UI_REVIEW_EXPECT_TITLE:-DraftOrbit}"
artifact_dir="${UI_REVIEW_ARTIFACT_DIR:-}"
skip_screenshots="${UI_REVIEW_SKIP_SCREENSHOTS:-0}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --url)
      url="$2"
      shift 2
      ;;
    --expect-title)
      expect_title="$2"
      shift 2
      ;;
    --artifact-dir)
      artifact_dir="$2"
      shift 2
      ;;
    --skip-screenshots)
      skip_screenshots=1
      shift
      ;;
    *)
      echo "error: unexpected argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "${UI_REVIEW_SKIP_BROWSER:-0}" == "1" ]]; then
  echo "SUMMARY: browser skipped via UI_REVIEW_SKIP_BROWSER=1"
  exit 0
fi

if [[ -z "$url" ]]; then
  url="http://127.0.0.1:${UI_REVIEW_PORT:-3000}"
fi

if [[ -z "$artifact_dir" ]]; then
  artifact_dir="$(mktemp -d "${TMPDIR:-/tmp}/draftorbit-ui-review.XXXXXX")"
else
  mkdir -p "$artifact_dir"
fi

if ! curl -fsSL --max-time 8 "$url" >/dev/null 2>&1; then
  echo "error: cannot reach $url" >&2
  echo "hint: start the local dev server, or pass --url/ UI_REVIEW_URL, or set UI_REVIEW_SKIP_BROWSER=1 to bypass intentionally." >&2
  exit 1
fi

session="draftorbit-ui-review-$$"
cleanup() {
  agent-browser --session "$session" close >/dev/null 2>&1 || true
}
trap cleanup EXIT

check_width() {
  local width="$1"
  local height="$2"
  local shot="$artifact_dir/${width}.png"
  agent-browser --session "$session" set viewport "$width" "$height" >/dev/null
  agent-browser --session "$session" wait 500 >/dev/null
  if [[ "$skip_screenshots" != "1" ]]; then
    agent-browser --session "$session" screenshot "$shot" >/dev/null
  fi
}

echo "[ui-browser-verify] Opening $url"
agent-browser --session "$session" open "$url" >/dev/null
agent-browser --session "$session" wait 1200 >/dev/null

title="$(agent-browser --session "$session" get title | tr -d '\r')"
current_url="$(agent-browser --session "$session" get url | tr -d '\r')"

if [[ "$title" != *"$expect_title"* ]]; then
  echo "error: page title '$title' does not contain expected substring '$expect_title'" >&2
  exit 1
fi

check_width 375 812
check_width 768 1024
check_width 1024 900
check_width 1440 1024

errors_file="$artifact_dir/errors.txt"
agent-browser --session "$session" errors > "$errors_file" || true
if [[ -s "$errors_file" ]]; then
  echo "error: browser reported page errors; see $errors_file" >&2
  sed -n '1,20p' "$errors_file" >&2 || true
  exit 1
fi

summary="browser pass; url=$current_url; title=$title; widths=375,768,1024,1440; artifacts=$artifact_dir"
echo "[ui-browser-verify] $summary"
echo "SUMMARY: $summary"
