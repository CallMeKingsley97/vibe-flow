# Vibe Flow 0.1.3

修复版，聚焦多 Agent 会话可见性与开发体验。

- 修复按来源列会话时 Gemini/Cursor 被隐藏；
- 会话名称长度按 Unicode 字符计数，emoji 不再被误判超长；
- 开发模式 CSP 允许 Vite HMR WebSocket；
- 修正 GitHub Release 校验 job 在无本地 checkout 时的仓库定位。

升级建议：从 0.1.x 直接安装覆盖即可，本地数据库与设置会保留。

安装前请阅读 [安装说明](docs/INSTALLATION.md) 和 [已知限制](docs/KNOWN_LIMITATIONS.md)。
