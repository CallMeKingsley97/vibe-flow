# ADR-013：删除高级采集模式

## 状态

已接受，2026-07-15。

## 背景

高级采集模式允许 Vibe Flow 自建会话、启动 Agent 子进程并读取 stdout/stderr。该能力与当前“只观察 Agent 自身本地历史”的产品边界重复，也增加了进程权限、生命周期、实时 Channel 和独立事件协议的维护成本。

## 决策

- 只保留 Codex、Claude、Gemini 和 Cursor 本地历史来源；
- 删除自建会话、进程启动与停止、Fixture 和 stdout/stderr 采集；
- 删除 `vibe_flow` 来源、进程事件类型和对应前后端 IPC；
- 前端根据历史文件变化通知重新读取数据库事件，不再订阅进程实时事件；
- migration 8 删除旧高级采集产生的 Vibe Flow 本地副本，并收紧数据库来源与事件类型约束；
- migration 不修改任何 Agent 原始历史文件。

## 结果

应用权限和运行时边界更清晰，后端不再具备启动任意 Agent 命令的能力。代价是无法在 Vibe Flow 内直接启动 Agent 或实时查看其标准输出；新增消息的及时性由 Agent 历史文件监听决定。
