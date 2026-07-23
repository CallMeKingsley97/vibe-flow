# Vibe Flow 设计语言

> 本文件是 Vibe Flow 界面设计的强制标准。所有新增视图、组件和样式必须遵循此规范。若与既有代码冲突，以本文件为准，既有代码应按机会逐步迁移。

## 1. 设计基调

Vibe Flow 的视觉基调对齐 Apple SwiftUI 与 macOS 系统应用：

- 层级分明、材质感强的深色界面；浅色主题镜像同样规则；
- 大量圆角、克制留白、生动但受控的强调色；
- 交互轻盈、动效有节制的弹性；
- 内容至上，装饰服从内容；不使用装饰性图形、渐变或阴影堆砌。

## 2. 设计令牌（唯一来源）

`src/app/styles.css` 顶端的 `:root` 是设计令牌的唯一来源。**新代码必须使用令牌，不允许硬编码颜色、圆角、间距或阴影值。**

令牌覆盖：颜色、材质、圆角、间距、字号、字重、行高、阴影、动效时长与曲线。修改令牌等同于修改产品视觉，请谨慎并同步截图验收。

### 2.1 颜色

采用与 SwiftUI 一致的语义色，避免"色号"直觉：

| 类别 | 语义 |
| --- | --- |
| Surface | `--surface-app` / `--surface-elevated` / `--surface-overlay` |
| Fill | `--fill-primary` / `--fill-secondary` / `--fill-tertiary` |
| Label | `--label-primary` / `--label-secondary` / `--label-tertiary` / `--label-quaternary` |
| Separator | `--separator` / `--separator-opaque` |
| Tint | `--tint` / `--tint-strong` / `--tint-soft` |
| Semantic | `--critical` / `--warning` / `--caution` / `--positive` |
| Semantic Soft | `--critical-soft` / `--warning-soft` / `--caution-soft` / `--positive-soft` |
| Ambient | `--surface-app-ambient`（页面背景环境光） |

页面背景优先使用 `--surface-app-ambient`（含克制的径向环境光），避免直接写死纯色。

强调色（tint）保持青绿色系（`--tint`），与既有品牌延续。危险与警告色只在真实风险和错误中使用，不做装饰。

### 2.2 圆角

- `--radius-xs` 6px — chip / badge / 小标签
- `--radius-sm` 8px — 二级按钮 / 输入内嵌部件
- `--radius-md` 10px — 主按钮 / 输入框 / 选择器
- `--radius-lg` 14px — 卡片 / 面板内块
- `--radius-xl` 18px — 顶层面板、Dashboard 卡片
- `--radius-2xl` 22px — Hero / 全局洞察大卡
- `--radius-full` 999px — 药丸、开关

### 2.3 间距

采用 4px 基线：`--space-1`(4) / `--space-2`(8) / `--space-3`(12) / `--space-4`(16) / `--space-5`(20) / `--space-6`(24) / `--space-8`(32) / `--space-10`(40)。

### 2.4 字号与字重

字体家族遵循 SF Pro/SF Pro Rounded 的替代方案：

```
--font-display: "SF Pro Display", "SF Pro Rounded", -apple-system, BlinkMacSystemFont, "PingFang SC", Inter, sans-serif;
--font-text:    "SF Pro Text", -apple-system, BlinkMacSystemFont, "PingFang SC", Inter, sans-serif;
--font-mono:    ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
```

字号 Token 对齐 Apple 文字风格：

| Token | 字号 / 行高 | 用途 |
| --- | --- | --- |
| `--text-caption2` | 10 / 14 | 极小辅助信息 |
| `--text-caption` | 11 / 15 | 元数据、标签 |
| `--text-footnote` | 12 / 16 | 次要说明 |
| `--text-subheadline` | 13 / 18 | 卡片副标题 |
| `--text-body` | 14 / 20 | 正文 |
| `--text-callout` | 15 / 21 | 表单主字 |
| `--text-headline` | 16 / 22 | 段落标题 |
| `--text-title3` | 18 / 24 | 卡片标题 |
| `--text-title2` | 22 / 28 | 面板标题 |
| `--text-title1` | 28 / 34 | 页面标题 |
| `--text-largetitle` | 34 / 40 | Hero 展示数字 |

字重：`--weight-regular`(420) / `--weight-medium`(560) / `--weight-semibold`(620) / `--weight-bold`(720)。避免使用超出这一集合的自定义字重。

### 2.5 材质与阴影

深色模式的"玻璃"材质通过半透明背景 + `backdrop-filter: blur()` 复合：

- `--material-thin` — 顶栏、Toast
- `--material-regular` — 面板、卡片
- `--material-thick` — 悬浮 popover

阴影使用 `--shadow-1` / `--shadow-2` / `--shadow-3` 三档，禁止再造阴影。

### 2.6 动效

统一节奏：

- `--duration-fast` 140ms — 微反馈（hover / focus）
- `--duration-base` 220ms — 组件出现、收起
- `--duration-slow` 320ms — 面板、页面切换
- `--ease-standard` `cubic-bezier(0.22, 1, 0.36, 1)` — 大部分状态变化
- `--ease-emphasized` `cubic-bezier(0.32, 0.72, 0, 1)` — 触发感明显的进入
- `--ease-spring` `cubic-bezier(0.3, 1.3, 0.4, 1)` — 需要弹性的（如卡片弹出）

禁止使用超过 400ms 的过渡时长，除非用于全屏页面转场。

## 3. 组件规则

- **面板 (Panel)**：`--radius-xl` 圆角，`--material-regular` 背景，`--separator` 描边，仅在必要时叠加 `--shadow-2`。
- **卡片 (Card)**：`--radius-lg` 圆角，间距不小于 `--space-4`，内部标题使用 `--text-headline` 或 `--text-title3`。
- **按钮**：主按钮使用 `--tint` 填色，文本使用 `--tint-on` 前景；次按钮使用 `--fill-secondary`；破坏按钮仅在破坏操作中出现。所有按钮统一 `--radius-md`。
- **输入**：高度 36–40px，`--radius-md`，聚焦态使用 `--focus-ring`（半透明 tint 环）。
- **开关 / 药丸标签**：`--radius-full`，跟随 tint。
- **列表项**：hover 用 `--fill-tertiary`；选中态使用 `--tint-soft` 底色 + 左侧 2px `--tint` 指示条。
- **图表条**：使用 tint 线性渐变，`--radius-full`，最小高度 4–6px。

## 4. 布局与节律

- 页面最外层留白 `--space-6` 到 `--space-8`；
- 卡片间距 `--space-4` 到 `--space-5`；
- 相邻信息组之间使用 8 或 12px 网格分割；
- 需要视觉分层的地方优先使用背景色分层，其次是 hairline 描边，最后才是阴影。

## 5. 视觉验收

新增或改造视图必须补上视觉验收步骤：

1. 使用真实数据本地跑一次；
2. 在深色与浅色主题下各截一张 1440px 宽的截图；
3. 与本文件"设计基调"对照检查：材质是否过重、圆角是否统一、留白是否符合网格、色温是否克制；
4. 出现例外时，在 PR 描述中说明理由。

## 6. 变更管理

设计语言的变更必须：

- 修改本文件；
- 更新 `src/app/styles.css` 中的令牌；
- 提交一份视觉验收（截图或 e2e）；
- 若变更影响品牌或跨页面语义，追加或更新 ADR。
