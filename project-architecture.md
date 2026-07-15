# Vibe Flow 项目架构

## 1. 项目定位

Vibe Flow 是一款本地 AI Coding Agent 会话观察与分析工具。

应用自动读取 Codex、Claude Code、Gemini CLI 和 Cursor 的本地历史记录，将不同格式统一为会话、消息、工具调用、Skill、MCP、命令、文件操作、公开推理摘要和错误事件，并提供直观的执行流程与统计。

项目只处理 Agent 自身已经记录或公开输出的数据，不抓取系统网络流量，不启动代理，不修改系统网络设置，也不尝试获取模型未公开的隐藏推理过程。

应用仅在用户主动检查更新时访问 GitHub Release；更新包必须通过内置公钥验签。

## 2. 核心能力

1. 自动发现本机支持的 Agent 及历史会话。
2. 监听新增会话和消息，自动同步到本地数据库。
3. 将不同 Agent 格式转换为统一事件模型。
4. 优先展示任务阶段和关键执行流程，再提供完整事件明细。
5. 统计消息、工具、Skill、MCP、命令、文件操作和错误。
6. 提取 Agent 实际执行的命令，并标记需要关注的高危操作。
7. 提供本地数据保留、清理、存储统计和安全诊断能力。
8. 提供损坏数据库恢复、签名更新和三平台发布能力。

## 3. 非目标

- 不抓取 HTTP、HTTPS 或系统网络流量。
- 不实现本地代理、系统代理、MITM 或证书管理。
- 不保存请求 Header、Body 或远程服务拓扑。
- 不修改 Agent 的原始历史文件。
- 不创建 Agent 会话，不启动或管理 Agent 子进程。
- 不承诺获取模型隐藏思维链。
- 不提供云同步、账号和团队协作。

## 4. 总体架构

```text
Codex / Claude / Gemini / Cursor 本地历史
                     │
                     ▼
            Source Discovery & Watcher
                     │
                     ▼
              Provider Adapters
                     │
                     ▼
             Unified Agent Events
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
             SQLite          History Change Channel
          │                     │
          └──────────┬──────────┘
                     ▼
             Application Services
                     │
                     ▼
              Tauri Commands
                     │
                     ▼
     React Session / Flow / Insights / Settings
```

## 5. 分层与依赖方向

Rust 后端：

```text
interfaces -> application -> domain
infrastructure -----------^
```

- `domain`：Agent 会话、统一事件和数据治理规则。
- `application`：查询事件、导入历史和清理数据。
- `infrastructure`：Agent adapters、文件监听和 SQLite。
- `interfaces`：Tauri commands、Channel 和 DTO。

React 前端：

```text
app -> pages -> widgets -> features -> entities -> shared
```

- `entities`：执行流程和 Agent 统计的纯计算模型。
- `features`：会话查询、历史同步和数据保留用例。
- `widgets`：会话列表、Agent 统计、执行流程、事件明细和设置界面。
- `pages`：页面布局与模块组合。

## 6. 核心数据模型

### CaptureSession

统一表示从本地 Agent 原始历史导入的只读会话索引。

关键字段：

- `source`：`codex | claude | gemini | cursor`
- `external_id`：外部会话稳定标识
- `source_path`：只读源文件路径
- `workspace`：会话工作目录
- `last_sequence`：统一事件序列
- `updated_at`：最后同步时间

### AgentEvent

所有来源统一转换为以下事件类型：

- message
- reasoning
- llm_usage
- tool_call / tool_result
- command
- file_change

事件 payload 保存 adapter 提取的结构化字段，例如：

- `toolName`
- `toolCategory`
- `callId`
- `skillName`
- `mcpServer`
- `operation`
- `failed`

## 7. 数据流

启动时 SQLite 会执行迁移和 `quick_check`。明确损坏的数据库会先备份，再创建空数据库；随后由四类 Agent 原始历史重新构建索引。临时锁、权限错误和 migration checksum 错误不会触发自动重建。

### 应用启动

1. 初始化 SQLite 并执行 migration。
2. 启动四类 Agent adapter 扫描。
3. 幂等导入发现的会话和事件。
4. 启动本地文件监听器。
5. 自动清理启用时，清理超过保留周期的本地副本。

### 文件更新

1. Watcher 收到变化并合并短时间内的重复通知。
2. 根据路径选择对应 adapter。
3. 重新解析单个会话文件。
4. 使用 `(source, external_id)` 生成稳定 UUID。
5. 事务内替换该会话的统一事件。
6. 通过 Channel 通知前端刷新。

### 页面展示

1. Agent 统计提供会话级摘要。
2. 执行流程按用户消息划分任务阶段并聚合连续工具噪音。
3. 事件明细保留完整顺序、筛选和定位能力。
4. 长会话按固定阶段窗口分页，并提供阶段缩略导航和风险筛选。

### 风险审查

风险识别只使用 Agent 已记录的命令和文件操作：

- `caution`：管理员权限、远程写入、权限修改或终止进程；
- `high`：递归删除、丢弃代码修改、强制推送、批量删除数据或发布操作；
- `critical`：删除系统目录、覆盖磁盘设备、fork bomb 或删除整个数据库。

风险规则必须展示命中原因并可定位原始事件。它属于审查提示，不阻止命令执行，也不作为绝对安全结论。

## 8. 隐私与安全边界

- 所有数据默认只保存在本机。
- Adapter 对 Agent 原始文件只读。
- 清理操作只删除 Vibe Flow 数据库副本。
- 诊断包不包含消息正文、工具参数、源文件或明文密钥。
- 自定义进程命令使用参数数组执行，不经过 shell 拼接。
- 单个损坏会话只产生来源警告，不影响其他来源。

## 9. 标准项目结构

```text
src/
├── app/
├── pages/
│   ├── dashboard/
│   └── settings/
├── widgets/
│   ├── agent-insights/
│   ├── execution-flow/
│   ├── thought-timeline/
│   └── app-shell/
├── features/
│   ├── capture-session/
│   ├── local-history/
│   └── data-retention/
├── entities/
│   ├── agent-event/
│   ├── execution-flow/
│   └── agent-insights/
└── shared/
    ├── api/
    ├── contracts/
    ├── hooks/
    └── lib/

src-tauri/src/
├── domain/
│   ├── session.rs
│   ├── event.rs
│   ├── history.rs
│   └── governance.rs
├── application/
│   ├── query_service.rs
│   ├── history_service.rs
│   └── governance_service.rs
├── infrastructure/
│   ├── history/
│   └── persistence/
└── interfaces/
    ├── commands.rs
    ├── channels.rs
    └── dto.rs
```
