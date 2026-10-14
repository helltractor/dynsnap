# CHANGELOG

## Unreleased（稳定性加固）

- **失败路径不再卡死**：截图管线新增超时上限（`timeoutMs`，默认 60s），覆盖预缓存 / 渲染 /
  导出 / 下载四类宿主调用。此前宿主挂起会让模块级 `capturing` 永久为 true，之后每次截图都
  只能提示「已有截图进行中」。`finally` 中每个还原步骤（留白 / 重排 / 懒加载属性 / 媒体播放 /
  提示）改为独立兜底，任一步抛错都不阻断后续还原与解锁。
- **图片等待取代固定 sleep**：新增 `waitForImages`，等待未完成图片加载，全部完成或超时
  （`imageWaitMs`，默认 2s）都会继续渲染，慢图不再截成空白。
- **懒加载还原**：`triggerLazyImages` 现在覆盖「占位图 + `data-src`」写法（此前只判 `src` 为空，
  真图永不加载），并清除优先级更高的 `srcset`；`loading` / `srcset` 在截图后还原，
  被暂停的媒体恢复播放。
- **尺寸守卫补面积维度**：除单边 24000px 上限外，新增总面积上限（2.4e8 px，Chromium 画布
  约 2.68e8）。此前 20000×20000 这类内容能通过单边检查，最终以「canvas.toBlob 导出失败」
  收场，丢失了「请使用单条评论截图」的替代方案提示。
- **评论菜单去重**：宿主会对同一条评论重复回调（评论区重建 / 重新观察），新增 `seenComments`
  WeakSet 去重，避免 `repliesUpdate` 重复绑定。
- **评论区按钮注入竞态**：新增 `pending` WeakSet 覆盖「正在注入」窗口（v3 需等待 shadow DOM，
  后台标签页下 `select` 轮询可能长达数十秒），此前该窗口内会注入出两个按钮；
  列表为空时退化为追加到头部，不再静默丢弃按钮。
- **还原路径兜底**：留白包装器若因宿主重渲染脱离文档，元素会还原到原父节点并告警，
  不再静默留在文档外。
- **元数据**：`urlInclude` 改用 `allVideoUrls`（含番剧 / 课程），这些页面的评论区此前
  因组件级门禁拿不到按钮。
- **构建安全**：`build.js` 在临时目录写 `.dynsnap-temp` 标记，只清理自己创建的目录；
  目录已存在且无标记时中止构建，避免误删 BE 仓库 `registry/` 下的同名手写组件。
  新增 `SIGINT` / `SIGTERM` / `exit` 清理，Ctrl+C 不再残留临时目录。
- **构建可复现**：拷贝到临时目录的源码统一归一化为 LF。产物内嵌 `index.md` 正文
  （description 注入），而 Windows 上 `core.autocrlf=true` 会把工作区检出成 CRLF，
  同一份源码在 Windows 与 Linux 上会构建出字节不同的产物——「产物与源码同步」校验
  因此会本机通过、CI 失败。归一化后两平台产物逐字节一致（已验证 CRLF 工作区构建结果
  与已提交的 LF 产物 SHA256 相同）。
- **CI / 发布门禁**：PR 任务改为从源码构建后再跑 fixture，并校验 `dist/dynsnap.js` 与源码同步
  （产物 tracked 且 raw URL 是安装入口，不同步会发旧版本）；`release.yml` 补跑
  `typecheck` + fixture——tag push 不触发 `ci.yml`，此前会发布从未校验过的产物。
- **测试**：fixture 断言由 14 增至 30，覆盖超时 / 面积守卫 / 懒加载两种写法 / 媒体恢复 /
  评论菜单去重 / `repliesUpdate` / v3 更新事件 + debounce / `videoChange` 重新注入；
  测试桩补齐 `CommentAreaV3` 与真实 `debounce`，此前 `instanceof CommentAreaV3` 恒为 false，
  上述路径零覆盖。固定 sleep 改为轮询等待，消除慢机器偶发失败。
- **文档**：README 修正 BE 仓库查找路径（默认是上两级目录，非「上级目录」）。

## v0.1.0（重构：core / ui 分层 + 类型门禁）

- **目录分层**：`src/` 由 3 个文件拆为分层结构——`core/`（`model` 配置模型 · `presets` B 站预设 ·
  `page-id` 文件名解析 · `reflow` 多图重排 · `padding` 底部留白 · `capture` 截图管线 · `log` 日志）、
  `ui/`（`area-button` 评论区按钮注入）。入口 `index.ts` 瘦身为纯接线（元数据 + 注册回调），
  依赖单向：entry → ui → core → snapdom，无运行时环。
- **预设去重**：`commentConfig` 与 `areaConfig` 此前完全相同，合并为 `plainConfig`。
- **类型门禁**：新增 `npm run typecheck`（`scripts/typecheck.js`，本地 typescript devDependency）：
  动态纳入宿主 `global.d.ts` 全局声明，只统计本项目 `src/` 的诊断；修复既有 3 处类型错误
  （媒体元素查询类型、重排网格闭包窄化、评论项上转型）。
- **JSDoc 统一**：导出按「一句话摘要 → 为什么 → 示例」结构书写（保留中文注释惯例）。
- **卫生**：`.gitignore` 移除死条目 `pnpm-lock.yaml`、忽略 `.mimosa/` 与 visual-check 侧车证据；
  移除失效的 `@dynsnap/src` 别名（tsconfig + build.js，改为相对导入）；入口补生命周期日志。
- **文档**：README / architecture.md 同步新目录结构；archify 架构图按新分层重新生成
  （v0.0.6 旧图归档至 `docs/archify/archive/`）。
- **无行为变更**：离线 fixture 测试 14/14 通过，构建产物与组件行为保持一致。

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
