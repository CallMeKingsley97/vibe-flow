# 发布流程

## 版本

以下三个文件的版本必须一致：

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

执行 `pnpm release:check` 进行校验。

## GitHub Secrets

Updater 必需：

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`（当前无密码密钥可留空）

macOS 正式签名与 notarization：

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `KEYCHAIN_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`

Windows Authenticode：

- `WINDOWS_CERTIFICATE`
- `WINDOWS_CERTIFICATE_PASSWORD`

私钥、p12、pfx 和密码禁止提交到仓库。

## 发布步骤

1. 更新版本、`CHANGELOG.md` 和 `RELEASE_NOTES.md`。
2. 执行 `pnpm release:check`、`pnpm check`、Rust test 和 Clippy。
3. 创建并推送版本标签，例如 `git tag v0.1.0 && git push origin v0.1.0`。
4. Release workflow 构建 macOS Universal、Windows 和 Linux 安装包。
5. Workflow 生成 updater artifacts、签名和 `latest.json`，并创建 Draft Release。
6. 人工核对安装包签名、更新清单和发布说明后发布 Draft。

当前 updater 公钥已写入 `tauri.conf.json`；对应私钥必须安全备份。丢失私钥后，已安装客户端无法验证使用新密钥签署的更新。

首次生成或轮换密钥使用：

```bash
pnpm tauri signer generate --write-keys /安全路径/vibe-flow-updater.key
```

将私钥文件内容写入 `TAURI_SIGNING_PRIVATE_KEY`，将密码写入 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。轮换公钥会中断旧客户端的自动更新链路，因此正式发布后不得随意更换。
