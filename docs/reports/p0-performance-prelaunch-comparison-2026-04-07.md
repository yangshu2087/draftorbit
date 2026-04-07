# DraftOrbit P0 性能收敛：可上线前对比报告（2026-04-07）

## 1) 目标与结论

- 目标：将 `generate` 主链路 P50 再压缩 **30%+**。
- 结果：在同等模拟网络条件（固定模型 RTT=18s）下，P50 从 **108,143ms** 降至 **36,097ms**，降幅 **66.62%**。
- 通过率：基线与优化版均为 **100%**（3/3）。
- 理解成本（可解释性）：
  - 继续保持全步骤 `stepExplain` 输出；
  - 新增 Fast Path 专项解释（research/outline/media/package），用户能直接看到“为何更快”与“下一步”。

---

## 2) 本次 P0 改造范围

### 2.1 OpenRouter 请求层收敛

文件：
- `/Users/yangshu/.openclaw/workspace/projects/021-draftorbit.io/apps/api/src/common/openrouter.service.ts`

变更：
- 增加分任务超时控制（`timeoutMs`）与候选模型尝试上限（`maxCandidates`）。
- 候选模型去重，避免同一模型重复请求导致无效等待。
- 增加全局可配置项（可通过环境变量覆盖）：
  - `OPENROUTER_TIMEOUT_MS`
  - `OPENROUTER_MAX_CANDIDATES`
- Mock 模式支持延迟注入（`OPENROUTER_MOCK_LATENCY_MS`），用于稳定复现实验。

### 2.2 生成链路 Fast Path（减少模型往返）

文件：
- `/Users/yangshu/.openclaw/workspace/projects/021-draftorbit.io/apps/api/src/modules/generate/generate.service.ts`

变更：
- 新增 `GENERATE_FAST_PATH_ENABLED`（默认开启，`0` 可关闭）。
- 将 HOTSPOT / OUTLINE / IMAGE / PACKAGE 改为本地启发式快速路径（并保留质量门控与必要时模型重写）。
- DRAFT / HUMANIZE 保持模型生成，确保核心质量。
- Package 阶段在质量低于阈值时仍触发高阶重写兜底（不牺牲质量）。

### 2.3 新增基准脚本

文件：
- `/Users/yangshu/.openclaw/workspace/projects/021-draftorbit.io/scripts/benchmark-generate.mjs`

能力：
- 自动执行 `v2/generate/run -> stream -> detail`。
- 输出 `P50/P90/PassRate` 到：
  - `/Users/yangshu/.openclaw/workspace/projects/021-draftorbit.io/artifacts/perf-generate/<run-id>/summary.json`

---

## 3) 测试方法

### A. 生产现网基线抽样（未部署本次优化）

样本（3 次）：
- `perf-after-20260407-062138-1` -> 123,528ms
- `perf-after-20260407-062355-2` -> 122,444ms
- `perf-after-20260407-062607-3` -> 243,302ms

汇总：
- P50: **123,528ms**
- P90: **219,347ms**

> 说明：这是“当前线上版本”的真实链路基线，用于评估上线收益。

### B. 本地可复现实验（A/B）

统一条件：
- `OPENROUTER_MOCK_MODE=1`
- `OPENROUTER_MOCK_LATENCY_MS=18000`
- `AUTH_MODE=self_host_no_login`
- 每组 3 次

基线组（Fast Path 关闭）：
- run id: `perf-local-baseline-20260407`
- 结果文件：
  - `/Users/yangshu/.openclaw/workspace/projects/021-draftorbit.io/artifacts/perf-generate/perf-local-baseline-20260407/summary.json`

优化组（Fast Path 开启）：
- run id: `perf-local-optimized-20260407`
- 结果文件：
  - `/Users/yangshu/.openclaw/workspace/projects/021-draftorbit.io/artifacts/perf-generate/perf-local-optimized-20260407/summary.json`

---

## 4) 对比结果（升级前后）

| 指标 | 基线（Fast Path=0） | 优化（Fast Path=1） | 变化 |
|---|---:|---:|---:|
| P50 | 108,143ms | 36,097ms | **-66.62%** |
| P90 | 108,159ms | 36,125ms | **-66.60%** |
| 通过率 | 100% (3/3) | 100% (3/3) | 持平 |

结论：已满足并显著超过“P50 再压 30%+”目标。

---

## 5) “通过率 / 理解成本”评估

### 5.1 通过率
- `@draftorbit/api` typecheck：通过
- `@draftorbit/api` tests：25/25 通过
- 生成基准（A/B）：基线与优化均 3/3 完成 `DONE` 且产出 tweet

### 5.2 理解成本（用户感知）
- 保持 `stepExplain` 全覆盖（6/6）。
- 优化版增加 Fast Path 解释文案，用户能直观看到：
  - 哪些步骤走了快速路径；
  - 为什么更快；
  - 质量仍由门控+重写兜底。

---

## 6) 上线前门禁建议

1. 先发布 API（含本次改造）。
2. 用生产测试租户跑 3 次真实 UAT 的 `generate.brief-chain`，确认真实 P50 改善幅度 ≥30%。
3. 若真实链路结果低于预期，优先调优：
   - `OPENROUTER_MAX_CANDIDATES=1~2`
   - `OPENROUTER_TIMEOUT_MS`
   - `GENERATE_FAST_PATH_ENABLED`（保持开启）

---

## 7) 关键命令（本次已执行）

```bash
npx -y pnpm@10.23.0 --filter @draftorbit/api typecheck
npx -y pnpm@10.23.0 --filter @draftorbit/api test
node --check scripts/benchmark-generate.mjs
```

