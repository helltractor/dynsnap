# dynshot · Bilibili-Evolved 组件（动态与评论截图）

在 [Bilibili-Evolved](https://github.com/the1812/Bilibili-Evolved) 中通过组件方式引入的截图功能:

- **动态卡片截图**：每条动态的「更多」菜单中提供「截图动态」，一键将动态卡片截为高清 PNG（自动附加底部留白 = 容器上界→头像位置距离，[10, 40]px 边界；「更多」菜单浮层不会截入图片）
- **评论截图**：视频 / 专栏 / 动态详情等页面的每条评论（含回复）菜单中提供「截图评论」
- **评论区整块截图**：评论区顶部提供「截图评论区」按钮，整块截图当前已加载的评论区

截图引擎使用 [SnapDOM](https://github.com/zumerlab/snapdom) v2.24.1（MIT），本地打包、零网络依赖。

---

## 目录结构（简单 `src` 布局，内部统一使用 `@dynshot/src` 别名）

```
dynshot/
├── src/                    # 组件源码
│   ├── index.ts            # 组件入口（defineComponentMetadata + entry + B 站预设）
│   ├── capture.ts          # 截图核心（多图重排 / 底部留白 / 懒加载 / 媒体暂停 / PNG 导出）
│   ├── snapdom.ts          # SnapDOM v2.24.1 引擎（MIT，本地打包）
│   └── index.md            # 组件描述（编译时自动注入）
├── userscript/installer.js # ★ Greasy Fork 用户脚本模板（内嵌组件产物）
├── build.js                # ★ 构建脚本（纯 Node，无需 tsx / pnpm，复用 BE 的 webpack 与 babel）
├── test/                   # 无头浏览器测试（fixture / userscript / real-page）
├── dist/
│   ├── dynshot.js          # ★ 组件产物（UMD，export: component）
│   └── dynshot.user.js     # ★ Greasy Fork 用户脚本产物
├── docs/
│   ├── architecture.html   # ★ archify 生成的交互式架构图
│   ├── archify/            # 架构图源规范（JSON）
│   └── architecture.md     # 与架构图对应的文字说明
├── package.json
└── tsconfig.json           # @dynshot/src 别名配置
```

## 架构图

交互式架构图：[docs/architecture.html](docs/architecture.html)
（由 [archify](https://github.com/tt-a1i/archify) 生成，源规范见 `docs/archify/dynshot.architecture.json`）。

## 构建（编译输出 JS 文件）

需要本机有一个已安装依赖的 [Bilibili-Evolved](https://github.com/the1812/Bilibili-Evolved) 仓库
（默认查找上级目录 `../Bilibili-Evolved`，也可用环境变量 `BILI_EVOLVED_PATH` 指定）：

```powershell
# 前置: 在 Bilibili-Evolved 仓库执行过
#   pnpm install && cd registry && pnpm install

node build.js
# 产物:
#   dist/dynshot.js       —— 组件 JS（UMD，export: component）
#   dist/dynshot.user.js  —— Greasy Fork 用户脚本（内嵌同一份组件代码）
```

构建脚本是纯 Node 实现（不依赖 tsx / pnpm 子命令）：直接调用 Bilibili-Evolved 仓库
node_modules 中的 webpack 与 babel（兼容 pnpm 虚拟仓库布局），并复刻官方的
description 注入与 `@/core` / `@/components` 等 externals，产物与官方 dev-server
编译的组件格式一致。

## 安装到 Bilibili-Evolved

1. 将 `dist/dynshot.js` 放到任意可访问的静态服务器（如 `npx serve` 或 BE 仓库的 dist 目录）。
2. 打开 b 站，进入脚本设置 → 组件管理，粘贴 JS 文件 URL 安装。
3. 刷新后即可使用。

> 也可将 `src/` 放入 Bilibili-Evolved 的 `registry/lib/components/feeds/dynshot/`，
> 走官方「组件开发」流程（`build component feeds/dynshot`）编译调试。

## 安装到 Greasy Fork

`dist/dynshot.user.js` 是可直接发布到 [Greasy Fork](https://greasyfork.org/) 的用户脚本：
安装后它会检测页面上是否已加载 Bilibili-Evolved，并调用 BE 的
`installFeatureFromCode` 把内嵌的 dynshot 组件安装进去（已安装则跳过）。

> 前提：浏览器里已安装 Bilibili-Evolved；未检测到时脚本会提示安装地址，不做其他动作。

## 测试

无头浏览器测试（Chrome / Edge + `puppeteer-core`）：

```powershell
npm install          # 安装 puppeteer-core（仅测试用）
npm test             # fixture + userscript + 真实页面
DYN_SHOT_SKIP_REAL=1 npm test   # 跳过需要网络的真实页面测试
```

| 套件 | 内容 |
|------|------|
| `test/fixture.test.js` | 离线 fixture：多图重排像素级校验、底部留白、头像入图、DOM 还原、评论截图、v3/v1 评论区按钮 |
| `test/userscript.test.js` | Greasy Fork 用户脚本：检测 BE、调用安装 API、内嵌代码可解析、已安装跳过 |
| `test/real-page.test.js` | 真实页面（需网络）：opus 详情页 / t.bilibili.com 动态详情页 |

## 使用

- **动态页 / 个人空间 / 动态详情**：点卡片右上角「···」→「截图动态」
  - 多图动态：截图前自动把横向滑动图集（`.bili-dyn-gallery`）重排为 3 列网格，避免只截到首图，截后完整还原
  - 底部留白：按「容器上界 → 头像顶部」距离动态计算（收敛到 10~40px），头像找不到时按 header 高度 × 0.6 兜底
  - 截图前暂停卡片内视频/音频、触发懒加载图片，并排除「更多」菜单浮层
- **视频 / 专栏 / 动态详情的评论区**：点评论（或回复）右下角菜单 →「截图评论」
- **视频 / 专栏 / 动态详情的评论区顶部**：「截图评论区」→ 整块截图当前评论区

## 实现说明

- 组件结构符合 [Bilibili-Evolved CONTRIBUTING.md](https://github.com/the1812/Bilibili-Evolved/blob/master/CONTRIBUTING.md) 的组件规范：
  `index.ts` 导出 `component`（`defineComponentMetadata`），`index.md` 作为描述，入口按需 `import()`。
- 内部模块统一通过 `@dynshot/src` 别名引用（`build.js` 与 `tsconfig.json` 中配置）。
- 动态卡片菜单参考 `registry/lib/components/feeds/copy-link`（`forEachFeedsCard` + `addMenuItem`）。
- 评论菜单参考 `registry/lib/components/utils/comments/copy-link`（`forEachCommentItem` + `addMenuItem`，处理 `repliesUpdate`）。
- 评论区顶部按钮参考 `registry/lib/components/utils/comments/image-export`（v1 / v2 / v3 评论区）。
- 仅面向 B 站，无任何多网站适配器预设。
- **与原插件的功能对照**：

  | 原插件功能 | 组件现状 |
  |-----------|---------|
  | 动态卡片菜单「截图动态」 | ✅ `forEachFeedsCard` + `addMenuItem` |
  | 多图重排（横向图集 → 网格） | ✅ `capture.ts` 中 `applyReflow`，截后还原 |
  | 底部留白（头像距离 / header 兜底） | ✅ `calcBottomPadding` + 内联 padding / 包装器降级 |
  | 懒加载图片触发、媒体暂停 | ✅ `triggerLazyImages` / `pauseMedia` |
  | 排除菜单浮层 / 角标 | ✅ SnapDOM `exclude` |
  | 评论截图（含回复） | ✅ 新增，评论菜单「截图评论」 |
  | 评论区整块截图 | ✅ 新增，评论区顶部「截图评论区」 |
  | opus 详情页跳转 `t.bilibili.com` 截图 | ⚠️ 已改为就地截图：t.bilibili.com 现已要求登录（无登录时页面为空），跳转方案不可用 |
  | URL 参数自动截图（`?bshot=1`） | ⚠️ 随跳转方案一并移除（仅服务于跳转流程） |

## 许可

MIT；截图引擎 [SnapDOM](https://github.com/zumerlab/snapdom) © Zumerlab，MIT。
