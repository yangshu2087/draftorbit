# Model routing dashboard (2026-04-18_14-48-28)

- Source log: `artifacts/model-gateway/model-gateway-events.ndjson`
- Window start (inclusive): `2026-04-17T14:48:28.523Z`
- Focus: format+taskType layered routing, health-probe-driven fallback, and routing observability.

## 1) Executive summary

| Metric | Value |
| --- | ---: |
| Requests | 4 |
| Success | 4 |
| Failed | 0 |
| Success rate | 100.0% |
| Fallback hits | 0 |
| Fallback rate | 0.0% |
| Avg request latency | 1ms |
| P95 request latency | 1ms |

## 2) Provider lane

| Provider | Attempts | Success | Error | Success rate | Avg latency | P95 latency | Top models | Top errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| codex-local | 0 | 0 | 0 | 0.0% | 0ms | 0ms | n/a | n/a |
| openai | 0 | 0 | 0 | 0.0% | 0ms | 0ms | n/a | n/a |
| openrouter | 4 | 4 | 0 | 100.0% | 1ms | 1ms | anthropic/claude-sonnet-4.6 (3)<br>google/gemini-3-flash-preview (1) | n/a |
| ollama | 0 | 0 | 0 | 0.0% | 0ms | 0ms | n/a | n/a |

## 3) Route lane (taskType × contentFormat)

| Lane | Requests | Success rate | Fallback rate | Avg latency |
| --- | ---: | ---: | ---: | ---: |
| media / diagram | 1 | 100.0% | 0.0% | 0ms |
| hook / tweet | 1 | 100.0% | 0.0% | 1ms |
| package / thread | 1 | 100.0% | 0.0% | 0ms |
| draft / article | 1 | 100.0% | 0.0% | 0ms |

## 4) Health probe outcome

- No provider was skipped by health cooldown in this window.

## 5) Latest provider health snapshot

| Provider | Healthy | Cooling down | Sample size | Failure rate | Consecutive failures | Last success | Last failure |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| codex-local | yes | no | 0 | 0.0% | 0 | n/a | n/a |
| openai | yes | no | 0 | 0.0% | 0 | n/a | n/a |
| openrouter | yes | no | 2 | 0.0% | 0 | 2026-04-18T14:48:11.887Z | n/a |
| ollama | yes | no | 0 | 0.0% | 0 | n/a | n/a |

## 6) Top request-level errors

- none

## 7) Runbook template

- Trigger this report after UAT/CI routing changes or provider incidents.
- Compare `Provider lane` success/latency and `Route lane` fallback rate before vs after release.
- If a provider enters repeated cooldown, inspect env keys + timeout + provider logs, then rerun this report.

```bash
MODEL_GATEWAY_OBSERVABILITY_ENABLED=1 \
MODEL_GATEWAY_OBSERVABILITY_LOG_PATH=artifacts/model-gateway/model-gateway-events.ndjson \
npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 report:model-routing
```

