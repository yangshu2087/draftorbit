# DraftOrbit 路径与索引收口清单（2026-04-08）

> **Current recovery note (2026-04-13/14):** this checklist was written for the earlier AI_SSD migration. The current requested target root is `/Volumes/AI_DEV_2T/01-projects/active/openclaw-workspace/projects/002-draftorbit.io`; implementation worktree is `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/recover-draftorbit-final`. Do not bulk-rewrite historical evidence paths.


> 目标：把 SSD 迁移后的“真实路径、项目入口索引、RAG 镜像、历史证据目录”关系说明白，并给后续清理留下一份明确清单。

## 1. Canonical path 决议

- **唯一真实项目根路径**：`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io`
- **旧路径仅作为历史引用保留**：`/Users/yangshu/.openclaw/workspace/projects/021-draftorbit.io`

决议：

- 活文档、入口索引、长期维护说明，统一改写为 SSD 新路径。
- 历史生成报告、历史 artifacts 中的旧绝对路径，默认**不批量回写**，避免破坏历史证据。

## 2. 本轮已完成的收口

- [x] 新增项目入口版：`docs/project-entry.md`
- [x] 新增完整知识恢复包：`docs/knowledge-recovery-2026-04-08.md`
- [x] 新增 V3 状态评审：`docs/v3-status-review-2026-04-08.md`
- [x] 更新 `docs/README.md` 作为文档总入口
- [x] 更新 `output/README.md` 为 SSD 路径说明
- [x] 更新 `artifacts/README.md` 为 SSD 路径说明

## 3. 当前已知未收口项

### 3.1 活文档中的旧路径

已确认命中：

- 之前的 `docs/README.md`
- `output/README.md`
- `artifacts/README.md`

本轮处理策略：

- 这三份入口文档已直接修正为 SSD 路径。

### 3.2 历史生成报告中的旧路径

大量命中：

- `output/reports/uat-full/*.md`
- `artifacts/uat/**/response-index.json`
- `artifacts/uat/**/responses/*.json`
- 部分旧审计/报告文件

处理策略：

- **保持原样**，视作历史证据。
- 不做全量替换，避免把“历史运行时环境”改写成“今天的环境”。

### 3.3 RAG source docs 未覆盖 V3

当前目录：

- `/Volumes/AI_SSD/02-ai-workbench/rag/source-docs/021-draftorbit.io`

当前内容只确认包含：

- V2 spec / UX / retrospective
- benchmark
- web ui checklist

缺口：

- `docs/project-entry.md`
- `docs/knowledge-recovery-2026-04-08.md`
- `docs/v3-product-spec.md`
- `docs/v3-ux-flow.md`
- `docs/v3-cost-margin-model.md`
- `docs/v3-status-review-2026-04-08.md`

### 3.4 文档归档目录为空

- `/Volumes/AI_SSD/05-docs-media/documents-archive/021-draftorbit.io`

影响：

- 当前没有外部会话导出、长文档归档或人工整理笔记被同步到这里。

## 4. 索引收口建议

### P0：入口索引统一

- [x] 把后续新增的长期文档都纳入 `docs/README.md`
- [x] 明确 `docs/project-entry.md` 是“新会话优先入口”
- [x] 明确 `docs/knowledge-recovery-2026-04-08.md` 是“完整事实档案”

### P1：RAG 镜像同步

- [ ] 将以下文档同步到 `/Volumes/AI_SSD/02-ai-workbench/rag/source-docs/021-draftorbit.io/`
  - `docs/project-entry.md`
  - `docs/knowledge-recovery-2026-04-08.md`
  - `docs/v3-product-spec.md`
  - `docs/v3-ux-flow.md`
  - `docs/v3-cost-margin-model.md`
  - `docs/v3-status-review-2026-04-08.md`

### P1：脚本输出路径核验

- [ ] 检查仍会写入旧绝对路径的脚本或模板
- [ ] 如果这些脚本用于**未来输出**，更新为 SSD 路径
- [ ] 如果这些脚本只用于解释历史报告，保留不动

### P2：外部会话/档案归位

- [ ] 如果未来找回 conversation export / transcript export，把它们统一归档到 `documents-archive/021-draftorbit.io`
- [ ] 增补一个索引文件，说明“哪些聊天原文可恢复，哪些不可恢复”

## 5. 处理边界

### 应该改

- 活文档
- 入口索引
- 当前仍参与维护的说明文件
- RAG 同步清单

### 不应该批量改

- 历史 UAT 报告
- 历史 response-index.json
- 历史 artifacts 响应体

原因：

- 这些文件记录的是“当时运行时上下文”，不是“今天的 canonical path”

## 6. 当前判断

- **事实**：SSD 迁移已经完成，但项目索引层还处在半收口状态。
- **事实**：历史报告中的旧路径大量存在，且大多属于“历史证据”而不是“活索引”。
- **建议**：后续优先做 RAG 镜像同步和未来输出脚本路径核验，不要先做历史报告大清洗。
