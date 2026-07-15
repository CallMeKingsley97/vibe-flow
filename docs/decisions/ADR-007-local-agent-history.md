# ADR-007：本地 Agent 历史导入与实时监听

## 状态

已采纳，2026-07-15。

## 背景

Vibe Flow 的早期界面要求用户先创建采集会话，再由应用启动 Agent。这适合调试，但不适合作为默认产品入口。用户更希望应用启动后直接看到已有的 Agent 会话，并在其他 Agent 创建或更新会话时自动刷新。

## 决策

1. 将本地历史会话作为默认入口，高级进程采集保留在折叠区域。
2. 为 Codex、Claude Code、Gemini CLI 和 Cursor 分别实现只读 adapter。
3. adapter 只负责路径发现和格式转换，业务层只处理统一的 `ImportedSession` 和 `ImportedEvent`。
4. 外部会话通过 `(source, external_id)` 生成稳定 UUID，重复扫描执行覆盖式幂等导入。
5. 使用文件系统轮询监听已存在的数据目录，每 2 秒检测新增和修改；事件经过 350 ms 合并后导入。
6. 不修改、删除或锁定任何 Agent 的源会话文件。
7. Codex transcript 作为兼容性输入，而不是稳定公共协议。后续需要更深实时集成时，优先接入 Codex app-server。

## 路径与格式

- Codex：`$CODEX_HOME/sessions`，默认 `~/.codex/sessions`，以及 archived sessions；
- Claude Code：`~/.claude/projects` 和 `~/.claude/transcripts`；
- Gemini CLI：`~/.gemini/tmp/*/chats` 与 `~/.gemini/chats`；
- Cursor：`~/.cursor/projects/**/agent-transcripts`，以及各平台 Cursor `state.vscdb` 中可识别的 composer/chat JSON。

这些本地格式都可能随产品版本变化。解析失败必须隔离到单个来源或文件，不能阻止其他来源导入。

## 隐私与安全

- 所有数据只在本地读取并写入 Vibe Flow 本地 SQLite；
- UI 明确显示数据来源和源工作目录；
- adapter 不读取认证配置、API Key、浏览器历史或无关缓存；
- Cursor 数据库只执行查询；不会运行数据库写语句；
- 后续导出功能仍需执行脱敏和用户确认。

## 后果

优势：

- 打开应用即可看到已有会话；
- 新会话和新增消息无需由 Vibe Flow 启动 Agent；
- 四种 Agent 统一展示，采集模式仍可补充更详细的实时数据。

代价：

- 本地格式变化可能导致 adapter 需要更新；
- 覆盖式导入会产生额外 SQLite 写入；
- Cursor 和 Gemini 的不同版本可能使用不同存储结构，需要持续增加 fixture 测试。
