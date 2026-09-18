# 第三方代码与许可声明（THIRD-PARTY NOTICES）

本项目包含或引用了下列第三方代码。本文件逐项说明其来源、在本项目中的使用方式与许可。

## 1. SnapDOM —— 内嵌引擎（vendored）

- **来源**：<https://github.com/zumerlab/snapdom>
- **版本**：v2.24.1
- **内嵌位置**：`src/snapdom.ts`（上游构建产物整体替换，头部保留出处注释；随组件打包进 `dist/dynsnap.js`，运行时零网络依赖）
- **版权**：Copyright (c) 2025 ZumerLab
- **许可**：MIT，许可文本如下：

```text
MIT License

Copyright (c) 2025 ZumerLab

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

> 注：构建时 Terser 会剥离注释，分发产物 `dist/dynsnap.js` 不含上述头部；
> 本声明文件即 SnapDOM 许可随本项目分发的载体。

## 2. Bilibili-Evolved —— 宿主运行时与构建工具链（未内嵌）

- **来源**：<https://github.com/the1812/Bilibili-Evolved>
- **作者 / 版权**：Grant Howard (the1812)、Coulomb-G（见其仓库 package.json `author` 字段）
- **许可**：MIT（见其仓库 package.json `license` 字段；BE 代码不随本仓库分发，故不附许可全文）

在本项目中的三种使用方式：

1. **运行时宿主 API**：`src/` 中 `@/core/*`、`@/components/*`、`@/ui` 等导入在构建时被声明为
   webpack externals，运行时读取宿主挂载的 `coreApis.*` / `coreApis.componentApis.*`，BE 代码不打包进组件产物。
2. **构建逻辑复刻**：`build.js` 复刻了官方 `webpack/inject-metadata/description.ts` 的
   `index.md` → `description` 注入逻辑，以及 `@/core` / `@/components` / `@/plugins` 的
   externals 与 UMD（export: component）产物约定，出处见 `build.js` 内注释。
3. **实现参考**：下列 BE registry 组件是菜单注入与评论区适配的实现参考——
   - [`registry/lib/components/feeds/copy-link`](https://github.com/the1812/Bilibili-Evolved/tree/master/registry/lib/components/feeds/copy-link)
     —— 动态卡片「更多」菜单注入模式（`forEachFeedsCard` + `addMenuItem`）
   - [`registry/lib/components/utils/comments/copy-link`](https://github.com/the1812/Bilibili-Evolved/tree/master/registry/lib/components/utils/comments/copy-link)
     —— 评论 / 回复菜单注入模式（`forEachCommentItem` + `repliesUpdate` 监听）
   - [`registry/lib/components/utils/comments/image-export`](https://github.com/the1812/Bilibili-Evolved/tree/master/registry/lib/components/utils/comments/image-export)
     —— 评论区顶部按钮注入（v1 / v2 / v3 评论区适配）
