# Vibe Flow 0.1.5

修复本地数据库迁移冲突导致应用无法启动的问题。

- 修复历史版本改写 migration 10 后，sqlx 校验失败导致 dev/安装包启动即崩溃；
- 启动时自动补齐 `base_url` / `is_favorite` / `user_tags` 字段，并同步迁移 checksum；
- 尽量将旧版 `session_annotations` 中的收藏/标签回填到当前会话字段；
- 保留原有 0.1.4 的全局搜索、收藏过滤与会话排序能力。

升级建议：从 0.1.x 直接安装覆盖即可，本地数据库与设置会保留。若此前无法启动，安装本版本后应可自动修复本地库。

安装前请阅读 [安装说明](docs/INSTALLATION.md) 和 [已知限制](docs/KNOWN_LIMITATIONS.md)。
