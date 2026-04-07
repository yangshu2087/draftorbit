# DraftOrbit Desktop (Tauri)

这是 DraftOrbit V2 的本地客户端壳（Tauri）骨架，用于提供：
- 本地化安装入口
- 与 Web Chat-first 体验一致的桌面操作流
- 后续本地知识库（Obsidian / 本地文件）更强隐私模式的接入点

## 开发约定
- 首期采用 `remote shell` 模式：桌面壳加载 `https://draftorbit.ai/chat`。
- 自托管场景可将 URL 改为私有部署地址。
- 后续再切到混合离线能力（本地索引 + 云端协作）。

## 运行（待本机安装 Tauri 工具链）
```bash
cd apps/desktop
pnpm install
pnpm tauri dev
```
