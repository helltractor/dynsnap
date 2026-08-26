# CHANGELOG

## v0.0.3（构建修复）

- 修复构建失败：不再通过 `pnpm tsx` 运行构建（pnpm 10+ 不再支持 `pnpm tsx` 子命令），
  `build.js` 改为纯 Node 实现，直接调用 Bilibili-Evolved 仓库 node_modules 中的 webpack / babel，
  并兼容 pnpm 虚拟仓库（`.pnpm`）布局，无 pnpm / tsx 依赖。
- 移除 `build-webpack.ts`。

## v0.0.2（组件重构）

- 重构为 Bilibili-Evolved 组件，源码统一放在 `src/`（内部使用 `@dynshot/src` 别名），不再维护多网站适配器与 registry 目录结构。
- 新增构建脚本：`node build.js` 复用 Bilibili-Evolved webpack 工具链，编译输出单个组件 JS 文件 `dist/dynshot.js`（UMD，export: component）。
- 保留动态卡片「截图动态」菜单（`forEachFeedsCard` + `addMenuItem`，参考 `feeds/copy-link`）。
- 新增评论截图：视频 / 专栏 / 动态详情等页面每条评论（含回复）菜单「截图评论」。
- 新增评论区整块截图：评论区顶部「截图评论区」按钮（v1 / v2 / v3 评论区均支持）。
- 截图引擎 SnapDOM v2.24.1（MIT）随组件本地打包，零网络依赖。
