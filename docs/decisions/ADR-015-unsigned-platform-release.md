# ADR-015：0.1.0 不使用平台代码签名

## 状态

已接受，2026-07-15。

## 决策

- 0.1.0 的 macOS 和 Windows 安装包不使用 Apple Developer ID 或 Authenticode 证书；
- Release workflow 不要求 Apple、Windows 证书 Secrets；
- Tauri updater artifact 继续使用项目 minisign 私钥签名，客户端继续执行公钥验签；
- 安装文档明确说明 Gatekeeper 和 SmartScreen 警告；
- 后续获得平台证书时，可恢复平台签名，不需要轮换 updater 密钥。

## 结果

首个版本可以在没有商业平台证书的情况下发布，但用户安装体验和系统信誉弱于已签名应用。Updater 签名不能替代操作系统平台签名。
