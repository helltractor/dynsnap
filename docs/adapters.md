# 移植新网站（3 分钟）

> [← 文档总览](index.md) · 适配器接口完整字段见 [architecture.md](architecture.md)

---

## 一、三步操作

1. **在 `sites.js` 的 `SITES` 数组加一个适配器对象**（模板见文件底部注释）
2. **在 `manifest.json` 的 `matches` / `host_permissions` 加该站域名**
3. **刷新扩展**（`chrome://extensions` → 🔄），F12 Console 过滤 `dynshot` 看注入日志（ 起默认输出，无需开 debug）

## 二、适配器填法速查

| 需要知道什么 | 怎么查 |
|-------------|--------|
| `targetSel` | F12 → 帖子/动态卡片元素 → 复制 selector |
| `menuPanelSel` | 点"更多" → 菜单容器元素 → 复制 class |
| `menuItemClassRe` | 菜单里任意一个原生项 → 其 class 中的关键词 |
| `moreBtnRe` | "更多"按钮（···）→ class 中的关键词 |
| `didOf` | 帖子元素上的 data 属性；或从 URL 正则提取 |
| `exclude` | 截图时不想出现的浮层/角标类名 |

> 完整字段表（`test` / `targetSel` / `feedContainerSel` / `menuPanelSel` / `cascaderOptionsSel` / `menuItemClassRe` / `moreBtnRe` / `paddingFn` / `paddingRef` / `paddingRatio` / `didOf` / `shotRedirect` / `exclude` / `inject` / `menuText` / `filePrefix` / `autoParams`）见 [architecture.md](architecture.md)。

## 三、无"更多"菜单的网站

设 `inject: 'corner'`：自动在卡片右上角挂 📸 按钮（无需菜单），其余逻辑不变。

## 四、适配器模板

在 `sites.js` 的 `SITES` 数组末尾追加（模板以 `sites.js` 文件底部注释为准）：

```js
{
  id: 'tieba',
  name: '贴吧',
  test: () => location.hostname === 'tieba.baidu.com',
  targetSel: '.j_thread_list [class*="threadlist_title"]',
  menuPanelSel: '...',          // F12 查"更多"菜单容器
  menuItemClassRe: /.../,       // 菜单项类名关键词
  moreBtnRe: /.../,             // "更多"按钮类名关键词
  didOf: el => el.getAttribute('data-tid') || (location.pathname.match(/\/p\/(\d+)/) || [])[1],
  exclude: ['...'],
  inject: 'menu',               // 无"更多"菜单可用 'corner'
  menuText: '截图',
  filePrefix: 'tb_',
  autoParams: [],
  shotRedirect: null            // （可选）返回跳转截图 URL；返回 null 就地在当前页截图
}
```