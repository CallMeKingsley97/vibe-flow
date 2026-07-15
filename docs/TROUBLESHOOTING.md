# 故障排查

## 没有发现会话

- 确认 Agent 已在默认目录生成历史文件；
- 点击首页“重新扫描”；
- 检查来源卡片是否显示“解析警告”；
- 生成安全诊断包，确认会话和事件数量。

## 新消息没有同步

文件监听采用约 2 秒轮询和 350 ms 合并窗口。等待数秒后重新扫描；单个损坏文件不会阻断其他来源。

## 数据库损坏

启动时会执行 SQLite `quick_check`。检测到明确损坏后，应用会把旧数据库重命名为 `vibe-flow.sqlite3.corrupt-时间戳`，创建新数据库并在顶部显示备份路径。Agent 原始历史不受影响，重新扫描即可恢复索引。

## 后端不可用

重启应用并检查诊断目录中的 `vibe-flow.log`。安全诊断包默认不包含该日志，因为日志可能包含本机路径。

## 更新失败

- 确认可以访问 GitHub Release；
- 更新包必须存在签名文件和 `latest.json`；
- 签名不匹配时应用会拒绝安装，不要绕过验签。

## 数据目录

- macOS：`~/Library/Application Support/dev.vibeflow.desktop`
- Windows：`%APPDATA%/dev.vibeflow.desktop`
- Linux：`~/.local/share/dev.vibeflow.desktop`
