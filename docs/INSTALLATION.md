# 安装说明

## macOS

从 GitHub Release 下载 Universal DMG，拖入 Applications。0.1.0 未使用 Apple Developer ID 签名或 notarization，Gatekeeper 会显示无法验证开发者。

## Windows

下载 MSI 或 NSIS 安装包。0.1.0 未使用 Authenticode 证书签名，SmartScreen 会显示未知发布者。

## Linux

优先使用 AppImage，也可使用 deb/rpm。部分发行版需要 WebKitGTK 4.1、GTK 3 和 AppIndicator 运行库。

## 从源码构建

1. 安装 Node.js 22、pnpm 10、Rust 1.85+。
2. 按 [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) 安装平台依赖。
3. 执行：

```bash
pnpm install --frozen-lockfile
pnpm tauri build
```

开发调试使用 `pnpm tauri dev`。
