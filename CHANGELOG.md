# CHANGELOG

## v0.0.6（测试 / 架构图 / Greasy Fork 分发）

- 新增 **Greasy Fork 用户脚本产物** `dist/dynsnap.user.js`：由 `userscript/installer.js` 模板内嵌组件代码生成，
  安装后检测 `window.bilibiliEvolved` 并调用 `installFeatureFromCode` 安装组件（已安装则跳过，未安装 BE 时给出提示）。
- 新增 **无头浏览器测试套件** `test/`（Chrome / Edge + puppeteer-core，共 29 项断言）：
  - `fixture.test.js`：多图重排像素级校验（4 图 3 列网格）、底部留白、头像入图、DOM 还原、评论截图、v3/v1 评论区按钮；
  - `userscript.test.js`：用户脚本检测 BE、调用安装 API、内嵌代码可解析、已安装跳过；
  - `real-page.test.js`：真实 opus / 动态详情页截图（需网络）。
- 新增 **archify 交互式架构图** `docs/architecture.html`（源规范 `docs/archify/dynsnap.architecture.json`），
  并据此重写 `docs/index.md`、`docs/architecture.md` 与 README。
- 版本号重新从 `0.0.2` 开始编号，本次发布为 `0.0.6`（package.json / 用户脚本 @version / 文档）。

## v0.0.5（补齐原插件功能：多图重排 / 底部留白 / 截图预处理）

- **恢复多图重排**：迁移到 BE 组件后该功能缺失，多图动态只截到首图。现截图前把横向滑动图集（`.bili-dyn-gallery`）重排为 3 列网格（6px 间距 / 最大 540px / 去掉 CDN `@` 压缩参数取原图），少于 2 张图跳过，截后完整还原。
- **修复底部留白失效**：动态卡片截图底部无空白、视觉“顶天立地”。现自动计算留白 = **容器上界 → 头像位置**的距离，收敛到 **[10px, 40px]**；头像缺失时回退为 header 高度 × 0.6；inline padding-bottom 被 CSS `!important` 覆盖时降级为「包装器方案」（临时白底 padding div，截后还原 DOM）。评论 / 评论区截图不受影响。
- **恢复截图预处理**：截图前暂停卡片内 `video/audio`、触发懒加载图片（不滚动页面）。
- **修复「更多」子浮窗被截入图片**：统一传入 SnapDOM `exclude`，排除 `.more-panel` / `.bili-dyn-more__menu` / `.opus-more__menu` / `.bili-dyn-item__more` / `.opus-more` / `.bili-cascader` 等菜单浮层与注入按钮。
- 截图核心由 `src/engine.ts` 迁移为 `src/capture.ts`（`CaptureConfig`：scale / waitMs / reconcile / reflow / padding / exclude）。
- **opus 详情页改为就地截图**：t.bilibili.com 现已要求登录（未登录页面为空，实测无 `.bili-dyn-item`），原「跳转旧版动态页」方案不可用；`?bshot=1` 自动截图参数随之一并移除。
- 用无头 Edge 端到端验证：多图重排像素级确认（4 张图 3 列网格、全部入图）、底部留白为纯白、头像入图、评论区 v3 shadow DOM 截图正常、截后 DOM 完整还原、无控制台错误；真实 opus / 动态详情页截图成功。
- 重新构建 dist/dynsnap.js（v0.0.5）。

## v0.0.4（修复截图产物为假 PNG）

- 修复截图功能失效：snapdom.toBlob() 默认输出 SVG（image/svg+xml），
  snapdom.toPng() 返回的是 HTMLImageElement，直接下载会得到「扩展名 .png 内容却是 SVG」的假 PNG，图片无法打开。
- src/engine.ts 改用 snapdom.toCanvas() 渲染 + canvas.toBlob('image/png') 导出，
  产物为真正的 PNG（已用无头 Edge 端到端验证：image/png、PNG 魔数 89 50 4E 47）。

## v0.0.3（构建修复）

- 修复构建失败：不再通过 `pnpm tsx` 运行构建（pnpm 10+ 不再支持 `pnpm tsx` 子命令），
  `build.js` 改为纯 Node 实现，直接调用 Bilibili-Evolved 仓库 node_modules 中的 webpack / babel，
  并兼容 pnpm 虚拟仓库（`.pnpm`）布局，无 pnpm / tsx 依赖。
- 移除 `build-webpack.ts`。

## v0.0.2（组件重构）

- 重构为 Bilibili-Evolved 组件，源码统一放在 `src/`（内部使用 `@dynsnap/src` 别名），不再维护多网站适配器与 registry 目录结构。
- 新增构建脚本：`node build.js` 复用 Bilibili-Evolved webpack 工具链，编译输出单个组件 JS 文件 `dist/dynsnap.js`（UMD，export: component）。
- 保留动态卡片「截图动态」菜单（`forEachFeedsCard` + `addMenuItem`，参考 `feeds/copy-link`）。
- 新增评论截图：视频 / 专栏 / 动态详情等页面每条评论（含回复）菜单「截图评论」。
- 新增评论区整块截图：评论区顶部「截图评论区」按钮（v1 / v2 / v3 评论区均支持）。
- 截图引擎 SnapDOM v2.24.1（MIT）随组件本地打包，零网络依赖。

## v0.0.1（迁移前的独立插件）

- 迁移前的 dynsnap 独立插件形态：SnapDOM 元素级截图、多图重排、底部留白、懒加载与媒体暂停，同时提供油猴脚本与 Chrome 扩展两种分发方式。
- 该版本为迁移到 Bilibili-Evolved 组件之前的最后状态。
