# CHANGELOG

## v0.0.2（组件重构）

- 重构为 Bilibili-Evolved 组件，源码统一放在 `src/`（内部使用 `@dynshot/src` 别名），不再维护多网站适配器与 registry 目录结构。
- 新增构建脚本：`node build.js` 复用 Bilibili-Evolved webpack 工具链，编译输出单个组件 JS 文件 `dist/dynshot.js`（UMD，export: component）。
- 保留动态卡片「截图动态」菜单（`forEachFeedsCard` + `addMenuItem`，参考 `feeds/copy-link`）。
- 新增评论截图：视频 / 专栏 / 动态详情等页面每条评论（含回复）菜单「截图评论」。
- 新增评论区整块截图：评论区顶部「截图评论区」按钮（v1 / v2 / v3 评论区均支持）。
- 截图引擎 SnapDOM v2.24.1（MIT）随组件本地打包，零网络依赖。
