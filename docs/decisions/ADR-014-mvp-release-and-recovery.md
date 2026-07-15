# ADR-014：MVP 发布、更新与数据库恢复

## 状态

已接受，2026-07-15。

## 决策

- 使用 GitHub Actions 构建 macOS Universal、Windows 和 Linux 安装包；
- macOS 和 Windows 正式发布必须注入平台代码签名证书；
- Tauri updater 产物使用独立 minisign 私钥签名，客户端只内置公钥；
- 更新由用户在设置页主动检查和安装，验签失败必须拒绝安装；
- 启动时执行 SQLite `quick_check`；明确损坏时备份旧数据库并创建新数据库；
- migration checksum、权限或临时锁错误不触发自动重建，避免误删可恢复数据；
- Release workflow 在创建 Draft Release 前运行 E2E、性能、Rust、前端和构建产物检查。

## 结果

发布者必须安全保存 updater 私钥以及 Apple、Windows 证书。数据库恢复会丢失损坏数据库内的派生索引，但不会修改 Agent 原始历史，重新扫描即可重建。
