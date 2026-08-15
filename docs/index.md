# dynshot 文档

> 项目：dynshot（通用 DOM 卡片截图）· 当前版本 v0.0.1（通用核心 + 站点适配器架构，性能版；opus 详情页跳转 t.bilibili.com 截图）
> 安装与使用见仓库根目录 [README](../README.md)。

---

## 文档地图

| 文档 | 内容 |
|------|------|
| [architecture.md](architecture.md) | 架构：适配器模式 + 核心逻辑（注入 / 截图 / opus 跳转）三段式，含踩坑总结 |
| [adapters.md](adapters.md) | 移植新网站：适配器接口速查、三步操作、无「更多」菜单方案 |
| [design.md](design.md) | 通用设计原则与已知限制 |

---

## 技术栈

| 类别 | 技术 | 说明 |
|------|------|------|
| 载体 | **Chrome 扩展（Manifest V3）** | 仅 `content_scripts` + `host_permissions`，**无 background、无额外权限** |
| 截图引擎 | **SnapDOM **（MIT，zumerlab/snapdom） | DOM 元素级捕获，零依赖、纯标准 Web API，**本地打包**（无 CDN/无 CSP 问题） |
| 语言 | **原生 JavaScript（ES2020+）** | 无框架、无构建工具、无 npm 依赖 |
| 关键 API | `MutationObserver`（单 observer 节流）/ `getComputedStyle` / `Element.closest` / `URLSearchParams` | 全部浏览器原生 |
| 注入范式 | 参考 **Bilibili-Evolved `addMenuItem`** | 卡片内查菜单面板 + Vue scoped 属性复制 |

---

## 目录结构

```
dynshot/
├── dynshot.js         # ✅ Tampermonkey 油猴版（单文件，引擎内嵌）
├── extension/         # ✅ Chrome 扩展
│   ├── manifest.json  # MV3 清单：matches 列出所有支持站点
│   ├── snapdom.js     # 截图引擎（155KB，本地打包，MIT）
│   ├── sites.js       # ★ 站点适配器注册表（换网站只改这里）
│   ├── content.js     # ★ 通用核心（与网站完全解耦）
│   └── content.css    # 兜底按钮样式
└── docs/              # 本文档目录（总览 / 架构 / 适配器 / 设计）
```