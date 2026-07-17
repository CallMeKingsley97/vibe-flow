# Vibe Flow 详细开发方案

> 本方案以“纯 Agent 本地会话观察”为唯一产品方向。网络代理、请求抓取、远程服务拓扑和 MITM 不属于项目范围。

## 1. 产品目标

Vibe Flow 帮助用户回答以下问题：

- 本机有哪些 Agent 会话，最近发生了什么？
- 一个任务分成了哪些阶段？
- Agent 使用了哪些 Skill、MCP 和工具？
- 执行了哪些命令、修改了哪些文件、发生了哪些错误？
- 不同 Agent 的工作方式和执行质量有什么差异？

## 2. 成功标准

| 领域 | 验收标准 |
| --- | --- |
| 自动发现 | 打开应用后自动展示支持来源的本地历史 |
| 实时同步 | 新会话和新增消息在文件变化后自动导入 |
| 统一模型 | 四类 Agent 转换为一致的会话和事件协议 |
| 可读性 | 先展示统计和执行流程，再展示事件明细 |
| 可追踪 | 流程节点能够定位到对应原始事件 |
| 性能 | 单会话 5,000 个事件仍可流畅筛选和滚动 |
| 安全 | 不修改 Agent 原始数据，诊断包不包含会话正文 |
| 稳定性 | 单文件解析失败不影响其他来源和会话 |

## 3. 统一事件设计

### 3.1 事件分类

- 用户与 Agent 消息
- Agent 公开推理摘要
- Agent 报告的 Token 用量
- Tool call / result
- Skill 使用
- MCP 调用
- 命令执行
- 文件读取或修改
- 计划和用户交互

### 3.2 Adapter 输出要求

每个 adapter 必须输出：

- 稳定的 external ID
- 会话名称、工作目录、开始和更新时间
- 时间有序的统一事件
- 结构化工具字段
- 可恢复的解析警告

工具 payload 推荐字段：

```json
{
  "toolName": "exec",
  "toolCategory": "command",
  "callId": "call_xxx",
  "operation": "运行测试",
  "skillName": null,
  "mcpServer": null,
  "failed": false
}
```

## 4. 后端开发规范

### 4.1 Domain

- 领域层不得依赖 Tauri、SQLx、文件系统或具体 Agent 格式。
- 会话状态机、事件类型和数据治理范围在领域层校验。
- 时间统一使用 UTC，对外使用 RFC 3339。

### 4.2 Application

- `CaptureService`：创建、停止、删除会话和追加事件。
- `QueryService`：会话和事件查询。
- `HistoryService`：来源扫描、adapter 路由和幂等导入。
- `GovernanceService`：设置、存储统计、清理和诊断。

### 4.3 Infrastructure

- `history/codex.rs`
- `history/claude.rs`
- `history/gemini.rs`
- `history/cursor.rs`
- `history/watcher.rs`
- `persistence/sqlite.rs`
禁止在 infrastructure 中修改 Agent 源文件。

### 4.4 Interfaces

Tauri Commands 只暴露应用用例：

- 会话与事件分页查询
- 本地历史扫描与变化订阅
- 数据设置、统计、清理和诊断

## 5. 前端开发规范

### 5.1 页面层级

Dashboard：

1. 来源状态
2. 会话列表
3. Agent 统计
4. 执行流程
5. 事件明细

Settings：

1. 保留周期
2. 自动清理
3. 存储统计
4. 安全诊断包
5. 数据来源与隐私边界

### 5.2 Agent 统计

会话级指标：

- 总事件数和持续时间
- 任务阶段数
- 用户与 Agent 消息数
- Tool、Skill、MCP 调用数
- 命令和文件操作数
- 错误数
- 常用工具、Skill、MCP 和事件构成排行
- 实际命令记录和归一化命令族排行
- 高危与需注意操作数量

统计必须只依赖统一 AgentEvent，不能依赖具体 Agent UI 或源格式。

### 5.3 执行流程

- 以用户消息划分任务阶段。
- 连续同类工具调用允许聚合。
- 默认突出 Skill、MCP、文件、错误和关键进展。
- wait、轮询等低价值事件默认不进入关键流程。
- 点击节点定位到事件明细。
- 长会话每次只渲染有限数量阶段，通过分页、缩略导航和“最近阶段”快速移动。
- 支持只查看包含高危操作的阶段。

### 5.4 命令与风险审查

- Adapter 将一个工具调用中的多个 `cmd` 保存为结构化 `commands` 数组。
- 同时保留原始命令文本和归一化命令族，例如 `git status`、`cargo test`。
- 命令记录最多优先展示最近 80 条，避免长会话界面无限增长。
- 风险等级为 `none | caution | high | critical`。
- 风险规则覆盖递归删除、代码丢弃、强制推送、数据删除、发布、系统权限和磁盘操作。
- 文件删除类操作即使没有命令文本，也可以根据结构化文件事件识别。
- 风险提示必须说明原因、醒目标色并支持定位原始事件。
- 规则只提供审查线索，不自动阻止 Agent，也不声称覆盖所有危险行为。

### 5.5 事件明细

- 使用虚拟列表。
- 支持关键词、事件类型和级别筛选。
- 仅在接近底部时自动跟随。
- 保留 sequence、时间、类型、级别和原始摘要。

## 6. SQLite 设计

核心表：

- `capture_sessions`
- `agent_events`
- `agent_settings`
- `_sqlx_migrations`

索引：

- `capture_sessions(updated_at)`
- `capture_sessions(source, external_id)`
- `agent_events(session_id, sequence)`
- `agent_events(session_id, timestamp)`

历史版本曾创建的非 Agent 表由 migration 7 删除。旧 migration 文件仅为已安装数据库的 SQLx checksum 兼容而保留，不代表当前功能。

## 7. 自动发现与监听

### 启动扫描

1. 检测各来源默认目录。
2. 并行扫描匹配文件。
3. 单文件解析失败转为来源警告。
4. 幂等导入数据库。
5. 返回来源检测状态和会话数量。

### 实时监听

- 监听已知来源目录。
- 2 秒轮询作为跨平台基础方案。
- 350 ms 合并重复文件事件。
- 只重新导入发生变化的文件。
- 前端收到变化通知后刷新对应会话。

## 8. 数据治理

- 自动清理默认关闭。
- 清理只针对超过保留周期的数据库会话副本。
- 清理前展示会话和事件数量。
- Agent 原始文件不受清理影响。
- 诊断包只包含版本、设置和数量汇总。

## 9. 测试策略

### Rust

- SQLite 重启持久化、迁移和级联删除
- 四类 adapter contract tests
- Cursor SQLite fixture
- 文件监听增量导入
- 设置持久化和清理边界
- 损坏数据库备份恢复
- 启动扫描到会话与事件查询的端到端路径

### TypeScript

- 历史事件去重合并
- 执行流程阶段和分类
- Agent 统计聚合
- 命令归一化和风险规则
- 10,000 事件统计与流程性能回归
- 风险入口到事件定位的组件端到端测试

### 发布前检查

```text
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test
pnpm build
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
pnpm tauri build --debug --no-bundle
```

## 10. 迭代路线

### 已完成

- 工程与持久化底座
- 会话和事件闭环
- 受控 Agent 进程采集（已从产品删除）
- 四类本地 Agent 自动发现与监听
- 执行流程与 Agent 统计
- 数据保留、清理和诊断
- M6：E2E、性能基线、异常恢复、三平台 CI、安装与隐私文档、签名自动更新与 0.1.0 发布就绪

### 当前阶段

- 推送 `v0.1.0` 标签并审核三平台 Draft Release / `latest.json`
- 真实安装机安装、升级、卸载与数据保留冒烟测试
- 发布 0.1.0 正式版

### 后续方向（M7）

- 跨 Agent / 项目 / 时间范围聚合统计与对比
- Skill、MCP、工具成功率与错误趋势
- 更大规模真实历史性能采样
- 会话标签、收藏和搜索（可按反馈裁剪）
- 本地导出经过用户确认的统计摘要（可按反馈裁剪）

所有后续功能继续以 Agent 自身记录为数据边界。
