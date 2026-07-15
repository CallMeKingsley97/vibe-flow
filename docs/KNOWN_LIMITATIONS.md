# 已知限制

- 仅支持 Codex、Claude Code、Gemini CLI 和 Cursor 已知的本地历史格式；上游格式变化可能造成解析警告。
- Cursor SQLite 读取依赖当前已知的数据表结构。
- 文件监听是轮询机制，新消息通常存在数秒延迟。
- 风险识别是可解释的启发式规则，不是完整安全扫描，也不会阻止 Agent 操作。
- Vibe Flow 不启动 Agent，因此只能展示 Agent 已写入历史文件的内容。
- 首个版本的三平台兼容由 CI 构建矩阵覆盖；不同 Linux 桌面环境仍可能存在 WebKitGTK 差异。
- 自动更新依赖 GitHub Release 可访问性；离线环境需手动下载安装包。
