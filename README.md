# dynsnap · Bilibili-Evolved 动态与评论截图组件

[![CI](https://github.com/helltractor/dynsnap/actions/workflows/ci.yml/badge.svg)](https://github.com/helltractor/dynsnap/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/helltractor/dynsnap?include_prereleases)](https://github.com/helltractor/dynsnap/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

[Bilibili-Evolved](https://github.com/the1812/Bilibili-Evolved) 组件：在 B 站页面一键截取**动态卡片**、**单条评论**与**整个评论区**，输出高清 PNG。

截图引擎为 [SnapDOM](https://github.com/zumerlab/snapdom) v2.24.1（MIT），随组件本地打包，零网络依赖。

## 功能

| 入口 | 说明 |
|------|------|
| 动态卡片「截图动态」 | 动态页 / 个人空间 / 动态详情中，点卡片右上角「···」菜单截图 |
| 评论「截图评论」 | 视频 / 专栏 / 动态详情的每条评论（含回复）菜单中截图 |
| 评论区「截图评论区」 | 评论区顶部按钮，整块截图当前已加载的评论区（v1 / v2 / v3 评论区均支持） |

动态卡片截图的自动处理：

- **多图重排**：横向滑动图集（`.bili-dyn-gallery`）截图前重排为 3 列网格，所有图片平铺入图，截后完整还原 DOM
- **底部留白**：按「容器上界 → 头像位置」距离动态计算（收敛到 10~40px），头像缺失时按 header 高度 × 0.6 兜底
- **截图预处理**：暂停卡片内视频 / 音频，触发懒加载图片，并排除「更多」菜单浮层与注入按钮

## 安装

1. 从 [Releases](https://github.com/helltractor/dynsnap/releases) 下载 `dist/dynsnap.js`（仓库为公开时也可直接用 CDN：
   `https://cdn.jsdelivr.net/gh/helltractor/dynsnap@latest/dist/dynsnap.js`）。
2. 将 JS 文件放到任意可访问的静态服务器（如 `npx serve`，或 Bilibili-Evolved 仓库的 dist 目录）。
3. 打开 B 站 → 脚本设置 → 组件管理，粘贴 JS 文件 URL 安装，刷新后生效。

## 从源码构建

构建复用 [Bilibili-Evolved](https://github.com/the1812/Bilibili-Evolved) 仓库的 webpack 与 babel 工具链，
需要本机有一个**已安装依赖**的 BE 仓库（默认查找本项目上级目录的 `Bilibili-Evolved`，
也可用环境变量 `BILI_EVOLVED_PATH` 指定）：

```powershell
# 前置：在 Bilibili-Evolved 仓库执行过
#   pnpm install && cd registry && pnpm install

npm install
node build.js
# 产物: dist/dynsnap.js —— 组件 JS（UMD，export: component）
```

构建脚本 `build.js` 为纯 Node 实现（不依赖 tsx / pnpm 子命令）：直接调用 BE 仓库 node_modules 中的
webpack 与 babel（兼容 pnpm 虚拟仓库布局），并复刻官方的 description 注入与 `@/core` / `@/components`
等 externals，产物与官方 dev-server 编译的组件格式一致。

> 也可将 `src/` 放入 Bilibili-Evolved 的 `registry/lib/components/feeds/dynsnap/`，
> 走官方「组件开发」流程（`build component feeds/dynsnap`）编译调试。

## 测试

无头浏览器测试（Chrome / Edge + `puppeteer-core`）：

```powershell
npm test                          # fixture + 真实页面
DYN_SNAP_SKIP_REAL=1 npm test     # 跳过需要网络的真实页面测试
npm run typecheck                 # 类型门禁（需要 Bilibili-Evolved 仓库，与构建同一前置）
```

| 套件 | 内容 |
|------|------|
| `test/fixture.test.js` | 离线 fixture：多图重排像素级校验、底部留白、头像入图、DOM 还原、评论截图、v3/v1 评论区按钮 |
| `test/real-page.test.js` | 真实页面（需网络）：opus 详情页 / t.bilibili.com 动态详情页 |

可用环境变量：

| 变量 | 作用 |
|------|------|
| `DYN_SNAP_SKIP_REAL=1` | 跳过需要网络的真实页面测试 |
| `DYN_SNAP_BROWSER` | 指定 Chrome / Edge 可执行文件路径（默认自动查找常见安装位置） |
| `DYN_SNAP_BROWSER_ARGS` | 追加 Chromium 启动参数，如 `--no-proxy-server`（系统代理失效时直连） |
| `BILI_EVOLVED_PATH` | 指定 Bilibili-Evolved 仓库位置（构建 / 类型门禁共用） |

## CI / 发布

- **CI**（`.github/workflows/ci.yml`）：push / PR 时并行执行 fixture 测试（离线）、类型门禁、dist 构建验证。
- **发布**（`.github/workflows/release.yml`）：推送 `v*` tag 时自动完成——
  校验 tag 与 `package.json` 版本一致 → 从 `CHANGELOG.md` 提取对应章节作为发布说明 → 构建 `dist/dynsnap.js` → 创建 GitHub Release 并附上产物。

发布新版本的步骤：

```powershell
# 1. 更新 package.json version 与 CHANGELOG.md（新增「## v0.x.y」章节）
# 2. 本地构建并更新 dist/dynsnap.js
node build.js
# 3. 提交后打 tag 并推送
git tag v0.x.y
git push origin main --tags
```

## 目录结构（`core` / `ui` 分层）

```
dynsnap/
├── src/                    # 组件源码
│   ├── index.ts            # 组件入口（defineComponentMetadata + entry 接线）
│   ├── core/               # 领域层（无 DOM 注入逻辑）
│   │   ├── model.ts        # 截图配置类型（CaptureConfig / ReflowConfig / PaddingConfig）
│   │   ├── presets.ts      # B 站页面预设（动态卡片 / 评论 / 评论区）与排除清单
│   │   ├── page-id.ts      # URL → 截图文件名 ID
│   │   ├── reflow.ts       # 多图重排（横向图集 → 网格，截后还原）
│   │   ├── padding.ts      # 底部留白（计算 + 应用 + 包装器降级）
│   │   ├── capture.ts      # 截图管线（预处理 / 渲染 / PNG 导出）
│   │   └── log.ts          # 组件名与 scoped console
│   ├── ui/
│   │   └── area-button.ts  # 评论区顶部「截图评论区」按钮注入（v1/v2/v3）
│   ├── snapdom.ts          # SnapDOM v2.24.1 引擎（MIT，本地打包）
│   └── index.md            # 组件描述（编译时自动注入）
├── build.js                # 构建脚本（纯 Node，复用 BE 的 webpack 与 babel）
├── scripts/
│   ├── typecheck.js        # 类型门禁（tsc --noEmit，仅统计 src/ 诊断）
│   └── release-notes.js    # 发布说明提取（CHANGELOG 章节 → release-notes.md）
├── test/                   # 无头浏览器测试（fixture / real-page）
├── dist/
│   └── dynsnap.js          # 组件产物（UMD，export: component）
├── docs/
│   ├── architecture.html   # 交互式架构图（archify 生成）
│   └── architecture.md     # 与架构图对应的文字说明
├── .github/workflows/      # CI 与发布流程
├── package.json
└── tsconfig.json           # 宿主 @/* 别名配置（指向 Bilibili-Evolved 仓库）
```

## 文档

- [交互式架构图](docs/architecture.html) —— 可缩放 / 搜索 / 按视图聚焦
- [架构与实现说明](docs/architecture.md) —— 与架构图对应的文字说明
- 更新记录见 [CHANGELOG.md](CHANGELOG.md)

## 许可

[MIT](LICENSE)；截图引擎 [SnapDOM](https://github.com/zumerlab/snapdom) © Zumerlab，MIT。

> 本项目为个人学习用途的第三方增强组件，与 B 站官方无关；使用时请遵守 B 站用户协议与相关法律法规。
