# dynshot · 通用 DOM 卡片截图

基于 **SnapDOM 开源引擎**（MIT，[zumerlab/snapdom](https://github.com/zumerlab/snapdom)）的通用网页卡片截图扩展：
为任意论坛网站的帖子/动态卡片注入「截图」入口，一键截取 **高清、内容原样** 的 PNG。

**当前版本 v0.0.1（通用核心 + 站点适配器架构，性能版）**，内置 B站动态适配器（opus 详情页自动跳转 t.bilibili.com 截图）。

---

## ✨ 功能

- **📸 入口注入「更多」菜单**：所有存在「更多」菜单的页面自动注入「截图动态」
- **就地截图，内容原样**：不跳转、不改动容器内容，按元素边界输出
- **元素级捕获**：无坐标/DPR/白边问题，`reconcile` 像素级精确布局
- **底部留白**：默认 40px，图片更美观
- **🔌 站点适配器架构**：换网站只加一个配置对象（`sites.js`），核心零改动

## 📦 安装（两种方式任选）

### 方式 A：Tampermonkey 油猴脚本（推荐，零权限）
1. 浏览器安装 [Tampermonkey](https://www.tampermonkey.net/)
2. 把 `dynshot.user.js` **拖入** Tampermonkey 面板（或新建脚本粘贴代码）
3. 打开 B站动态页，点卡片 `···` 菜单即可看到「截图动态」

> 油猴版 = 扩展版同一代码打包（SnapDOM 引擎内嵌 155KB，无 CDN/无网络依赖，`@grant none`）

### 方式 B：Chrome 扩展（开发者模式）
1. 打开浏览器扩展页：Chrome 输入 `chrome://extensions`，Edge 输入 `edge://extensions`
2. 打开右上角 **「开发者模式」**
3. 点击 **「加载已解压的扩展程序」**，选择：
   ```
   dynshot/extension/
   ```
4. 打开 B站动态页，点卡片 `···` 菜单即可看到「截图动态」。

## 🚀 使用

1. 打开任意支持页面（B站动态瀑布流 / opus 详情页等）。
2. 点击目标卡片右上角的 **···**（更多）菜单。
3. 点击 **「截图动态」**：当前页面直接截图（底部自动留白）→ 下载 PNG。

> **opus 详情页**：新版 opus 网页布局（代码/图片展示形式）已变动，就地截图不可靠 ——
> 点击「截图动态」会自动跳转 `t.bilibili.com/{id}` 旧版动态详情页（经典卡片，布局稳定），
> 截图完成后自动关闭。

## ⚙️ 配置

**通用配置**（`content.js` 顶部 `CFG`）：

| 常量 | 默认 | 说明 |
|------|------|------|
| `scale` | 3 | 输出倍率（清晰度） |
| `waitMs` | 600 | 图片加载等待上限（ms，不滚动页面） |
| `reconcile` | true | SnapDOM 像素级精确布局（防文本重排；约双倍耗时） |
| `bottomPadding` | 40 | 底部留白兜底值（px）；优先按适配器 `paddingFn`（如 B站：容器上界→头像顶部） |
| `showCornerBtn` | false | true = 额外显示右上角 📸 按钮 |

**站点配置**（`sites.js` 每个适配器对象）：见文件内注释模板。

## 🔌 移植新网站（3 分钟）

在 `sites.js` 的 `SITES` 数组追加一个配置对象：

```js
{
  id: 'tieba', name: '贴吧',
  test: () => location.hostname === 'tieba.baidu.com',
  targetSel: '.j_thread_list [class*="threadlist_title"]',
  menuPanelSel: '...',            // F12 查"更多"菜单容器
  menuItemClassRe: /.../,         // 菜单项类名关键词
  didOf: el => el.getAttribute('data-tid') || (location.pathname.match(/\/p\/(\d+)/) || [])[1],
  exclude: ['...'],
  inject: 'menu',                 // 或 'corner'（无菜单时用右上角按钮）
  menuText: '截图',
  filePrefix: 'tb_',
  autoParams: []
}
```

再在 `manifest.json` 的 `matches` / `host_permissions` 加上该站域名即可。详见 [docs/index.md](docs/index.md)（适配器速查：[docs/adapters.md](docs/adapters.md)）。

## 📁 目录结构

```
dynshot/
├── dynshot.js           # ✅ Tampermonkey 油猴版（单文件，引擎内嵌）
├── extension/                 # ✅ Chrome 扩展
│   ├── manifest.json          # matches 列出各支持站点
│   ├── snapdom.js             # SnapDOM （MIT 引擎，本地打包）
│   ├── sites.js               # ★ 站点适配器注册表（换站只改这里）
│   ├── content.js             # ★ 通用核心（与网站解耦）
│   └── content.css
├── README.md
├── CHANGELOG.md
└── docs/                      # 文档（总览 / 架构 / 适配器 / 设计）
```

## 📄 许可

MIT（扩展本体）；截图引擎 [SnapDOM](https://github.com/zumerlab/snapdom) © Zumerlab，MIT。