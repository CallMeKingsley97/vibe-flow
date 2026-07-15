# Vibe Flow

Vibe Flow 是一款本地 AI Coding Agent 会话观察与分析桌面应用。它自动读取 Codex、Claude Code、Gemini CLI 和 Cursor 的本地历史，展示任务阶段、工具、Skill、MCP、命令、文件操作、错误与高危操作。

## 产品边界

- 所有分析默认在本机完成；
- Agent 原始历史文件始终只读；
- 不抓取网络流量，不启动代理，不读取隐藏推理链；
- 不在应用内启动或管理 Agent 进程。

## 快速开始

开发环境需要 Node.js 22、pnpm 10、Rust 1.85+ 及 Tauri 2 的平台依赖。

```bash
pnpm install --frozen-lockfile
pnpm tauri dev
```

质量检查：

```bash
pnpm check
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

## 文档

- [安装说明](docs/INSTALLATION.md)
- [快速开始](docs/QUICK_START.md)
- [故障排查](docs/TROUBLESHOOTING.md)
- [隐私说明](docs/PRIVACY.md)
- [已知限制](docs/KNOWN_LIMITATIONS.md)
- [发布流程](docs/RELEASE.md)
- [性能基线](docs/PERFORMANCE.md)
- [架构](project-architecture.md)
- [Roadmap](ROADMAP.md)

## License

MIT
