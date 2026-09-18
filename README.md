# dynsnap · Bilibili-Evolved 动态与评论截图组件

[Bilibili-Evolved](https://github.com/the1812/Bilibili-Evolved) 组件：一键截取**动态卡片**、**单条评论**与**整个评论区**，输出高清 PNG。截图引擎为 [SnapDOM](https://github.com/zumerlab/snapdom)，本地打包、零网络依赖。

## 功能

| 入口 | 说明 |
|------|------|
| 动态卡片「截图动态」 | 动态页 / 个人空间 / 动态详情中，点卡片右上角「···」菜单截图 |
| 评论「截图评论」 | 视频 / 专栏 / 动态详情的每条评论（含回复）右下角菜单截图 |
| 评论区「截图评论区」 | 评论区顶部按钮，整块截图当前已加载的评论区（v1 / v2 / v3 均支持） |

动态卡片截图自动处理：横向多图图集重排为 3 列网格（截后完整还原 DOM）、底部留白（按头像位置动态计算，收敛 10~40px）、暂停视频 / 音频、触发懒加载图片、排除「更多」菜单浮层。

## 安装

本组件是 **Bilibili-Evolved 的自定义组件**，随 BE 运行，不独立安装：

1. 安装 [Bilibili-Evolved](https://github.com/the1812/Bilibili-Evolved#安装)。
2. 从 [Releases](https://github.com/helltractor/dynsnap/releases) 下载 `dist/dynsnap.js` 并托管到任意可访问的静态服务器
   （也可直接使用 CDN 直链：`https://cdn.jsdelivr.net/gh/helltractor/dynsnap@latest/dist/dynsnap.js`）。
3. 打开 BE 设置面板 → 左下「组件 / 插件 / 样式管理」→ 在输入框粘贴 JS 直链安装。官方说明见
   [BE README · 设置（添加功能）](https://github.com/the1812/Bilibili-Evolved#设置) 与
   [BE 文档站](https://bilibili-evolved-doc.vercel.app/)；用链接安装需要对应文件的直链。
4. 刷新 B 站页面后生效。

## 从源码构建

构建复用 [Bilibili-Evolved](https://github.com/the1812/Bilibili-Evolved) 仓库的 webpack / babel 工具链：
需要本机有**已安装依赖**的 BE 仓库（默认查找上级目录 `Bilibili-Evolved`，或用 `BILI_EVOLVED_PATH` 指定）。
`build.js` 为纯 Node 实现，产物与官方 dev-server 编译的组件格式一致。

```powershell
# 前置：在 BE 仓库执行过 pnpm install && cd registry && pnpm install
npm install
node build.js        # 产物: dist/dynsnap.js（UMD，export: component）
npm test             # fixture（离线）+ real-page（需网络）；DYN_SNAP_SKIP_REAL=1 跳过后者
npm run typecheck    # 类型门禁（与构建同一前置）
```

测试环境变量：`DYN_SNAP_BROWSER`（浏览器路径）、`DYN_SNAP_BROWSER_ARGS`（追加启动参数）、
`BILI_EVOLVED_PATH`（BE 仓库位置）。

## 文档

- [架构与实现](docs/architecture.md) · [交互式架构图](docs/architecture.html)
- [CI 与发布流程](docs/ci.md)
- [第三方引用声明](THIRD-PARTY-NOTICES.md)（SnapDOM 内嵌许可与 Bilibili-Evolved 出处）
- [更新记录](CHANGELOG.md) · [许可（MIT）](LICENSE)
