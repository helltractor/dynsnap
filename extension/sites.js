// sites.js —— 站点适配器注册表
// 架构：通用核心(content.js)只认适配器，不认具体网站。
// 移植新网站：在 SITES 数组追加一个配置对象即可（模板见文件底部注释）。
'use strict';

const SITES = [
  {
    id: 'bilibili',
    name: 'B站动态',

    // 当前页面是否属于本站（返回 true 时启用此适配器）
    test: () => /(^|\.)bilibili\.com$/.test(location.hostname),

    // 目标卡片选择器：截图/注入的对象（querySelectorAll 支持逗号）
    targetSel: '.bili-dyn-item, [class*="opus-card"], [class*="opus-detail"]',

    // 动态内容容器（observer 观察目标；缺省用 body）
    feedContainerSel: '.bili-dyn-list',

    // 可注入的菜单面板选择器（直接 append 菜单项；级联浮层见 cascaderOptionsSel）
    menuPanelSel: '.more-panel, .bili-dyn-more__menu, .opus-more__menu, .bili-dyn-item__more, .opus-more',
    // 级联浮层选项容器（body 下渲染，出现时自动注入）
    cascaderOptionsSel: '.bili-cascader-options',

    // 菜单项类名关键词：用于挑选原生菜单项作为样式参考
    menuItemClassRe: /(more__menu__item|cascader-options__item|child-button|c-pointer)/,

    // 更多按钮类名关键词：点击时记录归属卡片并触发注入
    moreBtnRe: /bili-dyn-more|opus-more|dyn-item__more/,

    // 提取目标 ID（返回值会用于文件名）
    didOf(el) {
      return el.getAttribute('data-did') ||
        (el.closest('[data-did]') || {}).getAttribute?.('data-did') ||
        (location.pathname.match(/(?:opus\/)?(\d+)/) || [])[1] || null;
    },

    // opus 详情页截图方式：新版 opus 网页布局（代码/图片展示形式）已变动，就地截图不可靠。
    // 点击「截图动态」时跳转 t.bilibili.com 旧版动态详情页（经典卡片，布局稳定），
    // 由 ?bshot=1 自动截图并自关闭。返回 null 表示就地在当前页截图（其余页面不受影响）。
    shotRedirect(el) {
      // 已在自动截图模式（URL 带 bshot）时禁止再跳转，防止跳转死循环
      if (new URLSearchParams(location.search).has('bshot')) return null;
      // 仅 opus 详情页走跳转；瀑布流 / 个人空间 / t.bilibili.com 等经典卡片页仍就地截图
      if (!/^\/opus\/\d+/.test(location.pathname)) return null;
      let did = null;
      try { did = el && this.didOf(el); } catch (e) { /* 忽略 */ }
      if (!did) did = (location.pathname.match(/(?:opus\/)?(\d+)/) || [])[1] || null;
      return did ? 'https://t.bilibili.com/' + did + '?bshot=1' : null;
    },

    // 截图时排除的元素（菜单容器/遮罩/角标等）
    exclude: [
      '.bs-entry',
      '.more-panel',
      '.bili-dyn-more__menu',
      '.opus-more__menu',
      '.bili-dyn-item__more',
      '.opus-more',
      '.bili-cascader',
      '.bili-dyn-card-video__cover__mask',
      '.dyn-video-preview',
      '.bs-btn'
    ],

    // 多图重排（参考 bili2tieba snapshot._REFLOW_GALLERY_JS）：
    // 横向滑动图集（gallery）截图时只露出首图，其余被裁掉；
    // 截图前将 gallery 重排为 N 列网格矩阵（所有图片平铺），截后完整还原。
    // gallerySel 必填；columns/gap/maxWidth/stripParams 可选（缺省 3 列 / 6px / 540px / 去 @ 参数）。
    reflow: {
      gallerySel: '.bili-dyn-gallery', // 横向滑动画廊容器选择器（卡片内查找）
      columns: 3,                      // 重排列数
      gap: 6,                          // 网格间距（px）
      maxWidth: 540,                   // 网格最大宽度（px）
      stripParams: true                // true = 去掉图片 URL '@' 后的 CDN 压缩参数，取原图
    },

    // 底部留白 = 容器上界 → 头像容器顶部的距离（即本函数返回值，核心不再放大；
    // 0/负值会被核心收敛到保底下边界（10px）；返回 null/抛异常时核心走 paddingRef / bottomPadding 兜底链；
    // 结果统一按 [minBottomPadding, maxBottomPadding] 上下边界收敛）
    paddingFn(el) {
      // 优先在 header 内找头像，避免误匹配正文/转发/评论区里的其他头像
      const header = el.querySelector('.bili-dyn-item__header, [class*="header"]');
      const avatar = (header && header.querySelector('.bili-avatar, [class*="avatar"]')) ||
        el.querySelector('.bili-avatar, [class*="avatar"]');
      if (!avatar || avatar.offsetHeight === 0) return null;
      return Math.round(avatar.getBoundingClientRect().top - el.getBoundingClientRect().top);
    },
    // 兜底：头像找不到时用 header 高度 × 比例
    paddingRef: '.bili-dyn-item__header, [class*="opus-card"] [class*="header"], [class*="opus-detail"] [class*="header"]',
    paddingRatio: 0.6,

    // 注入形态：'menu'（更多菜单）| 'corner'（右上角按钮）| 'both'
    inject: 'menu',

    // 注入的菜单项文字
    menuText: '截图动态',

    // 文件命名前缀
    filePrefix: 'bili_',

    // 自动截图参数（URL 含任一参数时自动截第一个目标）
    autoParams: ['bshot']
  }

  // ================= 新增网站模板 =================
  // {
  //   id: 'tieba',
  //   name: '贴吧',
  //   test: () => location.hostname === 'tieba.baidu.com',
  //   targetSel: '.j_thread_list [class*="threadlist_title"]',
  //   menuPanelSel: '...',          // F12 查"更多"菜单容器
  //   menuItemClassRe: /.../,       // 菜单项类名关键词
  //   moreBtnRe: /.../,             // 更多按钮类名关键词
  //   didOf: el => el.getAttribute('data-tid') || (location.pathname.match(/\/p\/(\d+)/) || [])[1],
  //   exclude: ['...'],
  //   inject: 'menu',               // 无"更多"菜单可用 'corner'
  //   menuText: '截图',
  //   filePrefix: 'tb_',
  //   autoParams: [],
  //   shotRedirect: null       // （可选）返回跳转截图 URL（如 opus 页 → t.bilibili.com）；返回 null 就地在当前页截图
  //   reflow: null             // （可选）多图重排：{ gallerySel, columns, gap, maxWidth, stripParams }，见 B站示例
  // }
];

// 返回当前页面匹配的站点适配器
function getActiveSite() {
  return SITES.find(s => s.test()) || null;
}