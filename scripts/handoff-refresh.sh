#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

exec /Users/yangshu/Codex/scripts/update-agent-handoff.sh --repo "$repo_root" "$@"
