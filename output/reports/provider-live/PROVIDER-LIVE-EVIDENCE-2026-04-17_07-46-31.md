# DraftOrbit provider live evidence (2026-04-17_07-46-31)

- Evidence root: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/live-provider-evidence/artifacts/provider-live-evidence/2026-04-17_07-46-31`
- Policy: local default remains independent; missing provider keys are recorded as `skipped_missing_key` and do not break default Codex/Ollama/baoyu UAT.
- Policy: configured provider keys must either produce `live_pass` evidence from that provider or fail closed as `fail_closed`; mock/free/local fallback is never counted as live provider quality evidence.
- Secrets: key values are never written; provider errors are redacted and truncated.

## Summary

| Provider | Status | Model/source | Duration | Evidence | Error |
| --- | --- | --- | ---: | --- | --- |
| OpenAI | `skipped_missing_key` | n/a | 0ms | n/a | n/a |
| OpenRouter | `skipped_missing_key` | n/a | 0ms | n/a | n/a |
| Tavily | `skipped_missing_key` | n/a | 0ms | n/a | n/a |

## Details

### OpenAI

- status: `skipped_missing_key`
- keyEnv: `OPENAI_API_KEY` (missing)
- durationMs: `0`

### OpenRouter

- status: `skipped_missing_key`
- keyEnv: `OPENROUTER_API_KEY` (missing)
- durationMs: `0`

### Tavily

- status: `skipped_missing_key`
- keyEnv: `TAVILY_API_KEY` (missing)
- durationMs: `0`

## Run guidance

```bash
OPENAI_API_KEY=... OPENROUTER_API_KEY=... TAVILY_API_KEY=... npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api exec tsx ../../scripts/provider-live-evidence.ts
```

