# 架构与核心逻辑

> [← 文档总览](index.md) · dynshot v0.0.1
---

## 一、架构：适配器模式

```
sites.js（数据）           content.js（逻辑）
┌──────────────────┐      ┌──────────────────────────┐
│ SITES[]          │      │ getActiveSite()          │
│ ├─ bilibili      │ ───▶ │ site.targetSel  → 收集卡片 │
│ └─ (新网站)       │      │ site.menuPanelSel→ 注入菜单│
└──────────────────┘      │ site.didOf      → ID 提取 │
                          │ site.exclude    → 截图排除│
                          │ site.inject     → 注入形态│
                          └──────────────────────────┘
```

**适配器接口**（每个网站一个对象）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `test()` | fn | 当前 URL 是否本站 |
| `targetSel` | string | 目标卡片 CSS 选择器（可逗号多选） |
| `feedContainerSel` | string | observer 观察目标容器（缺省 body，如 B站 `.bili-dyn-list`） |
| `menuPanelSel` | string | "更多"菜单面板选择器（卡片内查找） |
| `cascaderOptionsSel` | string | 级联浮层选项容器（body 下渲染，出现时自动注入） |
| `menuItemClassRe` | regex | 菜单项类名关键词（找样式参考项） |
| `moreBtnRe` | regex | "更多"按钮类名关键词 |
| `paddingFn(el)` | fn | 动态底部留白：返回「容器上界 → 头像顶部」距离（≥0 直接用） |
| `paddingRef` | string | 留白参考元素选择器（头像找不到时按元素高度 × 比例兜底） |
| `paddingRatio` | number | 参考元素高度比例系数（默认 1，B站 0.6） |
| `didOf(el)` | fn | 从元素/URL 提取帖子 ID |
| `shotRedirect(el)` | fn | （可选）返回跳转截图 URL；返回 null 就地在当前页截图（如 B 站 opus 页 → `t.bilibili.com/{did}?bshot=1`） |
| `exclude` | string[] | 截图时排除的元素 |
| `inject` | 'menu'\|'corner'\|'both' | 注入形态 |
| `menuText` | string | 注入的菜单项文字 |
| `filePrefix` | string | 下载文件名前缀 |
| `autoParams` | string[] | URL 含任一参数时自动截第一个目标 |

---

## 二、核心逻辑（三段式）

```
① 注入：全局单 observer(100ms 节流) → scan + injectAnywhere → 点击"更多"时动态绑定 lastTarget 注入
② 截图：触发懒加载图片并等待(不滚动页面) → 底部留白(临时padding) → SnapDOM 捕获 → 下载 PNG
③ 自动：URL 含 autoParams 任一参数 → 自动截第一个目标
```

### 2.1 注入（最难、最值钱的部分）

```js
// 1) 初始化：全局单 MutationObserver（100ms 节流合并）+ 15s 低频兜底扫描（性能版）
// 2) 注入双通道：卡片级 injectCardPanel（卡片内查面板）+ injectAnywhere 全局兜底
//    面板查找：el.querySelector(site.menuPanelSel)；级联浮层走 cascaderOptionsSel（body 下）
// 3) 菜单项创建（核心技巧）：
//    a. 完整复制原生菜单项 className（含框架 scoped 类）
//    b. 复制全部 data-* 属性（Vue scoped 样式生效的关键）
//    c. 复制内联 style
//    d. getComputedStyle 复制关键文本样式（保底，防样式链断裂）
//    e. textContent 直接设置文字（保证显示）
// 4) 动态绑定：点击"更多"时记录 lastTarget，点击「截图动态」取 lastTarget（注入一次，位置固定）
// 5) 兜底：菜单注入失败 900ms 后自动挂右上角 📸 按钮
```

**踩坑总结**：

| 坑 | 解决 |
|----|------|
| 菜单是 Vue scoped 渲染，手动创建样式不匹配 | 复制 `data-v-*` + className + 计算样式 |
| 克隆原生项出现空白 | 手动创建 + 直接 textContent + 计算样式保底 |
| 菜单浮层被截进图片 | `exclude` 排除全部菜单容器选择器 |
| 点击菜单项后菜单不关闭 | 对"更多"按钮模拟 `mouseleave` |

### 2.2 截图

```js
snapdom.download(card, {
  scale: CFG.scale,      // 3，清晰度
  dpr: 1,                // 与系统 DPR 解耦，杜绝白边/放大
  exclude: site.exclude, // 排除菜单容器/角标
  backgroundColor: '#fff',
  reconcile: CFG.reconcile // 像素级精确布局（防字体回退文本重排）
});
```

### 2.3 opus 详情页跳转截图

新版 opus 网页布局（代码/图片展示形式）变动，就地截图不可靠，B 站适配器改用**跳转式截图**：

```
opus 页点击「截图动态」→ shotRedirect 返回 t.bilibili.com/{did}?bshot=1
  → window.open 新标签打开（脚本打开，截图后可自关闭）
  → t.bilibili.com 旧版动态详情页（经典卡片布局稳定）?bshot=1 触发自动截图
  → 下载 PNG → window.close()
```

- 适配器新增可选字段 `shotRedirect(el)`：返回跳转 URL（opus 页 → t.bilibili.com），返回 null 就地在当前页截图；核心 `decideShot()` 统一裁决菜单项 / 右上角按钮。
- URL 已带 `bshot` 时 `shotRedirect` 强制返回 null，防止跳转死循环。
- opus 详情页菜单注入实测可用，「截图动态」菜单项即跳转入口，无需额外兜底按钮。
- 自动截图模式等待目标卡片最多 10 次 × 600ms 重试（约 6s），兼容跳转页懒加载。