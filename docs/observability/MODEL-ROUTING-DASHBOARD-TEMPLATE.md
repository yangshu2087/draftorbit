# Model Routing Dashboard Template

> 用于 DraftOrbit 路由策略分层、健康探针降级、与可观测性复盘的标准模板。

## 1) 版本与范围

- 日期：`YYYY-MM-DD`
- 分支/commit：`<branch>/<sha>`
- 观察窗口：`<hours>`
- 日志源：`artifacts/model-gateway/model-gateway-events.ndjson`

## 2) 总览 KPI

- 请求总量：
- 成功率：
- fallback 率：
- 平均耗时：
- P95 耗时：

## 3) Provider Lane

| Provider | Attempts | Success rate | Avg latency | P95 latency | Top error |
| --- | ---: | ---: | ---: | ---: | --- |
| codex-local |  |  |  |  |  |
| openai |  |  |  |  |  |
| openrouter |  |  |  |  |  |
| ollama |  |  |  |  |  |

## 4) Route Lane (taskType × contentFormat)

| Lane | Requests | Success rate | Fallback rate | Avg latency |
| --- | ---: | ---: | ---: | ---: |
| draft/article |  |  |  |  |
| package/thread |  |  |  |  |
| hook/tweet |  |  |  |  |

## 5) Health Probe 状态

- 连续失败阈值：
- 失败率阈值：
- cooldown：
- 被跳过 provider 统计：

## 6) 关键异常与处理

- Top 错误：
- 影响面：
- 已实施回滚/降级：

## 7) 结论与下一步

- 是否达标（是/否）：
- 下一步动作：

---

### 建议命令

```bash
MODEL_GATEWAY_OBSERVABILITY_ENABLED=1 \
MODEL_GATEWAY_OBSERVABILITY_LOG_PATH=artifacts/model-gateway/model-gateway-events.ndjson \
MODEL_ROUTER_DASHBOARD_HOURS=24 \
npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 report:model-routing
```
