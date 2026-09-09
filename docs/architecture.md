# 架构与实现

> [← 文档总览](index.md) · [交互式架构图](architecture.html) · dynshot v1.1.0

本文件与 `docs/architecture.html`（archify 生成的交互式架构图）一一对应。

## 一、架构总览

架构图把项目分成两个区域：**浏览器（B 站页面）** 的运行时链路，以及 **构建与分发** 链路。

| 节点 | 类型 | 职责 |
|------|------|------|
| 用户 | 外部 | 点击「截图动态 / 截图评论 / 截图评论区」 |
| B 站页面 | 前端 | 动态卡片 / 评论区（含 Shadow DOM）/ opus 详情页 |
| Bilibili-Evolved | 宿主运行时 | 提供 `coreApis` / `componentApis`：菜单注入、评论区监听、下载、通知 |
| dynshot 组件入口 | 后端 | `src/index.ts`：注册回调、B 站预设（`cardConfig` / `commentConfig` / `areaConfig`） |
| 截图核心 | 后端 | `src/capture.ts`：多图重排、底部留白、懒加载、媒体暂停、排除项、PNG 导出 |
| SnapDOM 引擎 | 后端 | `src/snapdom.ts`（v2.24.1，MIT，本地打包）：`toCanvas()` 渲染 |
| B 站图片 CDN | 云服务 | `i0.hdslb.com` 等图床，`preCache` 转 dataURL 避免跨域污染 canvas |
| PNG 下载 | 外部 | `DownloadPackage.single` 触发浏览器下载 |
| 组件源码 src/ | 后端 | `index.ts` / `capture.ts` / `snapdom.ts` |
| 构建脚本 build.js | 后端 | 纯 Node，复用 BE 的 webpack + babel，输出单文件产物 |
| 构建产物 dist/ | 后端 | `dynshot.js`（组件 UMD）、`dynshot.user.js`（Greasy Fork 用户脚本） |
| Greasy Fork | 外部 | 用户脚本分发，调用 BE 的 `installFeatureFromCode` 安装组件 |

## 二、运行时链路（架构图视图 1）

```
用户 → B 站页面 → BE 运行时 → dynshot 组件入口 → 截图核心 → SnapDOM → PNG 下载
```

1. **菜单注入**：BE 的 `forEachFeedsCard` + `addMenuItem` 给每条动态加「截图动态」；
   `forEachCommentItem` + `addMenuItem` 给每条评论（含回复）加「截图评论」。
2. **触发截图**：组件入口调用 `captureElement(element, id, config)`，config 决定是否重排 / 留白 / 排除。
3. **预处理**：暂停卡片内 `video/audio`、触发懒加载图片（不滚动页面）。
4. **多图重排**：把 `.bili-dyn-gallery` 横向图集临时替换为 3 列网格（6px / 最大 540px / 去 CDN `@` 参数），<2 图跳过，截后还原。
5. **底部留白**：`paddingFn` 取「容器上界 → 头像顶部」距离，收敛 `[10, 40]px`；头像缺失按 header × 0.6 兜底；inline padding 被 `!important` 覆盖时降级为包装器。
6. **渲染与导出**：`preCache` 预热图片/字体 → `snapdom.toCanvas()` → `canvas.toBlob('image/png')` → `DownloadPackage.single`。

## 三、评论区链路（架构图视图 2）

- **单条评论**：评论 / 回复菜单「截图评论」，监听 `repliesUpdate` 为展开的回复补注入。
- **整个评论区**：`forEachCommentArea` 注入顶部按钮
  - v3（`bili-comments`）：`select` 等待 shadow DOM 的 `bili-comments-header-renderer`，在最后一个 `bili-text-button` 后追加按钮；
  - v1 / v2：追加到 `.bili-tabs__nav__items`；
  - `videoChange` 时刷新按钮。

## 四、构建与分发链路（架构图视图 3）

```
src/ ──build.js──▶ dist/dynshot.js ──▶ BE 组件管理（粘贴 URL 安装）
                          └────────▶ dist/dynshot.user.js ──▶ Greasy Fork
```

- **build.js**：纯 Node，不依赖 tsx / pnpm 子命令；从 Bilibili-Evolved 仓库的
  `node_modules`（含 pnpm `.pnpm` 虚拟仓库）解析 webpack / babel，临时把 `src/`
  同步到 BE 的 `registry/lib/components/feeds/dynshot`（以触发官方 description 注入），
  编译后清理并输出 UMD 组件。
- **组件产物**：`@/core/*`、`@/components/*`、`@/ui` 等被声明为 externals，
  运行时读取 BE 挂载的 `coreApis.*` / `coreApis.componentApis.*`，因此产物很轻。
- **用户脚本产物**：`userscript/installer.js` 模板 + 内嵌同一份组件代码，
  在 Greasy Fork 上安装后检测 `window.bilibiliEvolved`，调用
  `installFeatureFromCode` 完成组件安装（已安装则跳过）。

## 五、关键实现细节

- **SnapDOM 返回值**：`toBlob()` 输出 SVG、`toPng()` 返回 HTMLImageElement；
  只有 `toCanvas()` + `canvas.toBlob` 能得到真正的 PNG（否则下载到的是「假 PNG」）。
- **opus 详情页**：原插件跳转 `t.bilibili.com/{id}` 的方案已不可用（该站现要求登录），
  改为就地截图 `.bili-opus-view`；长文会得到很高的长图（SnapDOM 在 16384px 处等比缩放）。
- **尺寸保护**：目标边长 > 12000px 时降为 1 倍率，> 24000px 时拒绝并提示改用单条评论截图。

## 六、测试

`test/` 下为无头浏览器（Chrome / Edge + puppeteer-core）测试：

| 套件 | 内容 |
|------|------|
| `fixture.test.js` | 离线 fixture：多图重排像素级校验、底部留白、头像入图、DOM 还原、评论截图、v3/v1 评论区按钮 |
| `userscript.test.js` | Greasy Fork 用户脚本：检测 BE、调用安装 API、内嵌代码可解析、已安装跳过 |
| `real-page.test.js` | 真实页面（需网络）：opus 详情页 / t.bilibili.com 动态详情页截图 |

```powershell
npm test                      # 全部
DYN_SHOT_SKIP_REAL=1 npm test # 跳过真实页面测试
npm run test:fixture          # 仅离线 fixture
```
