# 架构与实现

> [← 文档总览](index.md) · dynshot v1.0.0

## 一、架构：简单 `src` 布局 + 编译产物

不再维护 Bilibili-Evolved 的 `registry/lib/components/...` 目录结构，项目本体只有两大部分：

```
dynshot/
├── src/                    # 组件源码（内部用 @dynshot/src 别名引用）
│   ├── index.ts            # 组件入口：defineComponentMetadata + entry
│   ├── index.md            # 组件描述（webpack 自动注入 description）
│   ├── engine.ts           # 截图与下载封装（SnapDOM）
│   └── snapdom.ts          # SnapDOM v2.24.1 引擎（MIT，本地打包）
└── dist/dynshot.js         # ★ 编译产物：单个组件 JS（UMD，export: component）
```

构建链：

```
node build.js（纯 Node 构建脚本，无需 tsx / pnpm）
  ├─ 临时把 src/ 同步到 BE 仓库 registry/lib/components/feeds/dynshot（构建后清理）
  ├─ 调用 BE node_modules 中的 webpack + babel（兼容 pnpm 虚拟仓库布局）
  │    ├─ babel/TS loader + description 注入（复刻官方 inject-metadata）
  │    ├─ @dynshot/src 别名 → 本项目 src/
  │    └─ @/core、@/components 等 externals → 运行时由脚本本体提供
  └─ 输出 dist/dynshot.js（单文件，UMD，export: component）
```

Bilibili-Evolved 组件产物不打包核心 API：`@/core/*`、`@/components/*`、`@/plugins/*`、
`@/ui` 在构建时被声明为 externals，运行时直接读取脚本本体挂载的
`coreApis.componentApis.*` / `coreApis.core.*` 全局对象。因此编译产物是一个依赖
Bilibili-Evolved 运行时的轻量组件 JS，可在组件管理中直接安装。

## 二、功能流程

### 动态卡片截图

`forEachFeedsCard({ added }) → addMenuItem(card, { text: '截图动态' }) → captureElement(card.element, id, cardConfig)`

参考 `registry/lib/components/feeds/copy-link`。`cardConfig` 携带原插件的核心能力：

- **多图重排**：截图前把 `.bili-dyn-gallery`（横向滑动图集）临时替换为 N 列网格
  （3 列 / 6px 间距 / 最大 540px / 去掉 CDN `@` 压缩参数取原图），少于 2 张图跳过，截后完整还原。
- **底部留白**：`paddingFn` 计算「容器上界 → 头像顶部」距离，结果收敛到 `[10, 40]px`；
  头像找不到时按 `paddingRef`（header）× `paddingRatio`（0.6）兜底，最后回退到 40px。
  优先内联 `padding-bottom`，被 `!important` 覆盖时降级为包装器。
- **截图预处理**：暂停卡片内 `video/audio`、触发懒加载图片（不滚动页面）。
- **排除项**：`.more-panel` / `.opus-more` / `.bili-cascader` 等菜单浮层与注入按钮不截入图片。

### 评论截图

`forEachCommentItem({ added }) → 对 [comment, ...comment.replies] 逐条 addMenuItem('截图评论')`，
并监听 `repliesUpdate` 事件，评论展开更多回复时自动补注入。

参考 `registry/lib/components/utils/comments/copy-link`。

### 评论区整块截图

`forEachCommentArea` 为每个评论区注入顶部按钮：

- v3（`bili-comments`）：通过 `select` 等待 shadow DOM 中的 `bili-comments-header-renderer`，
  在最后一个 `bili-text-button` 后追加「截图评论区」按钮（参考 `utils/comments/image-export`）。
- v1 / v2：追加到 `.bili-tabs__nav__items`。

点击后对 `area.element` 整块截图。`videoChange` 时刷新按钮。

### opus 详情页

原插件的做法是跳转 `t.bilibili.com/{id}?bshot=1` 用旧版卡片截图，但 t.bilibili.com
现在要求登录（未登录时页面为空，实测无 `.bili-dyn-item`），跳转方案已不可用。
组件改为**就地截图** `www.bilibili.com/opus/{id}` 的 `.bili-opus-view`
（`forEachFeedsCard` 的 opus 适配器即以此为卡片元素），长文会得到很高的长图。

## 三、截图引擎（`src/capture.ts`）

- 截图流程：暂停媒体 → 触发懒加载 → 多图重排 → 等待图片（600ms）→ 底部留白 →
  `preCache` 预热 → `snapdom.toCanvas` → `canvas.toBlob('image/png')` → `DownloadPackage.single`。
- 注意 SnapDOM 的返回值：`toBlob()` 输出 SVG、`toPng()` 返回 HTMLImageElement，
  只有 `toCanvas()` + `canvas.toBlob` 能得到真正的 PNG。
- 高度 > 12000px 时降为 1 倍率，> 24000px 时拒绝（浏览器 canvas 尺寸限制）。
- 引擎为第三方 MIT 代码，本地打包，无 CDN / 无网络依赖。
