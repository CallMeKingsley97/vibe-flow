# 安装说明

## macOS

从 GitHub Release 下载对应 Apple Silicon 或 Intel 的 DMG，拖入 Applications。正式发布包使用 Apple Developer ID 签名并完成 notarization。

## Windows

下载 MSI 或 NSIS 安装包。正式发布包使用 Authenticode 证书签名；安装时应显示发布者身份。

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
