# dynshot · Bilibili-Evolved 组件（动态与评论截图）

在 [Bilibili-Evolved](https://github.com/the1812/Bilibili-Evolved) 中通过组件方式引入的截图功能:

- **动态卡片截图**：每条动态的「更多」菜单中提供「截图动态」，一键将动态卡片截为高清 PNG
- **评论截图**：视频 / 专栏 / 动态详情等页面的每条评论（含回复）菜单中提供「截图评论」
- **评论区整块截图**：评论区顶部提供「截图评论区」按钮，整块截图当前已加载的评论区

截图引擎使用 [SnapDOM](https://github.com/zumerlab/snapdom) v2.24.1（MIT），本地打包、零网络依赖。

---

## 目录结构（简单 `src` 布局，内部统一使用 `@dynshot/src` 别名）

```
dynshot/
├── src/                    # 组件源码
│   ├── index.ts            # 组件入口（defineComponentMetadata + entry）
│   ├── engine.ts           # 截图与下载封装（SnapDOM）
│   ├── snapdom.ts          # SnapDOM v2.24.1 引擎（MIT，本地打包）
│   └── index.md            # 组件描述（编译时自动注入）
├── build.js                # 构建入口：node build.js
├── build-webpack.ts        # webpack 构建脚本（复用 Bilibili-Evolved 工具链与 externals）
├── dist/dynshot.js         # ★ 编译产物：单个组件 JS 文件（UMD，export: component）
├── package.json
├── tsconfig.json           # @dynshot/src 别名配置
└── docs/
```

## 构建（编译输出 JS 文件）

需要本机有一个 [Bilibili-Evolved](https://github.com/the1812/Bilibili-Evolved) 仓库
（默认查找上级目录 `../Bilibili-Evolved`，也可用环境变量 `BILI_EVOLVED_PATH` 指定）：

```powershell
node build.js
# 产物: dist/dynshot.js
```

构建脚本复用 Bilibili-Evolved 的 webpack 配置（babel/TS loader、description 注入、
`@/core` / `@/components` 等 externals），产物与官方 dev-server 编译的组件格式一致。

## 安装到 Bilibili-Evolved

1. 将 `dist/dynshot.js` 放到任意可访问的静态服务器（如 `npx serve` 或 BE 仓库的 dist 目录）。
2. 打开 b 站，进入脚本设置 → 组件管理，粘贴 JS 文件 URL 安装。
3. 刷新后即可使用。

> 也可将 `src/` 放入 Bilibili-Evolved 的 `registry/lib/components/feeds/dynshot/`，
> 走官方「组件开发」流程（`build component feeds/dynshot`）编译调试。

## 使用

- **动态页 / 个人空间 / 动态详情**：点卡片右上角「···」→「截图动态」
- **视频 / 专栏 / 动态详情的评论区**：点评论（或回复）右下角菜单 →「截图评论」
- **视频 / 专栏 / 动态详情的评论区顶部**：「截图评论区」→ 整块截图当前评论区

## 实现说明

- 组件结构符合 [Bilibili-Evolved CONTRIBUTING.md](https://github.com/the1812/Bilibili-Evolved/blob/master/CONTRIBUTING.md) 的组件规范：
  `index.ts` 导出 `component`（`defineComponentMetadata`），`index.md` 作为描述，入口按需 `import()`。
- 内部模块统一通过 `@dynshot/src` 别名引用（`build-webpack.ts` 与 `tsconfig.json` 中配置）。
- 动态卡片菜单参考 `registry/lib/components/feeds/copy-link`（`forEachFeedsCard` + `addMenuItem`）。
- 评论菜单参考 `registry/lib/components/utils/comments/copy-link`（`forEachCommentItem` + `addMenuItem`，处理 `repliesUpdate`）。
- 评论区顶部按钮参考 `registry/lib/components/utils/comments/image-export`（v1 / v2 / v3 评论区）。
- 仅面向 B 站，无任何多网站适配器预设。

## 许可

MIT；截图引擎 [SnapDOM](https://github.com/zumerlab/snapdom) © Zumerlab，MIT。
