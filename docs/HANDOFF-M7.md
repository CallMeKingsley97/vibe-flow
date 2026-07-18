# Handoff：M7 跨维度聚合洞察

> 更新时间：2026-07-18  
> 状态：**主清单 1–6 已完成**；Skill/MCP 成功率趋势与更大规模基线明确 Deferred。

## 已完成

### 设计语言
- `docs/DESIGN_LANGUAGE.md`
- `docs/decisions/ADR-016-design-language.md`
- `src/app/styles.css` 设计令牌 + Insights 样式（对齐 `GlobalInsights.tsx` class）

### 后端
- `domain/analytics.rs` 聚合协议
- `AnalyticsRepository` + `AnalyticsService`
- `SqliteRepository::global_insights` SQL 下推
- `get_global_insights` command + DTO
- 测试：empty / by source / workspace / day-week / tool ranking(wait 过滤) / interactive baseline
- 修复：ranking `GROUP BY` 不用 alias `name`（与表列冲突导致错误聚合）

### 前端
- `/insights` 页面 + 导航
- `useGlobalInsights`（history-change debounce 800ms）
- Dashboard `?workspace=` 过滤 + 清除 chip
- 测试：`formatInsights.test.ts`、`GlobalInsights.test.tsx`

### 文档
- `ROADMAP.md` M7 ✅
- `project-architecture.md` 聚合服务章节
- `development-plan.md` M7 记入已完成
- `README.md` 链接设计语言

## 明确后续（非本轮阻塞）
- Skill/MCP/工具成功率与错误趋势
- 更大规模（10 万会话）性能阈值复核

## 验证
```bash
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
pnpm typecheck
pnpm test
# 建议：pnpm tauri dev → 打开 /insights
```
