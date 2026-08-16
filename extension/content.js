// 通用核心
// 依赖注入顺序（manifest content_scripts）：snapdom.js → sites.js → content.js
// 站点相关的一切（选择器/ID提取/排除项/注入形态）来自 sites.js 适配器。
'use strict';

const CFG = {
  scale: 3,                  // 输出倍率（清晰度）
  waitMs: 600,               // 图片加载等待上限（ms）
  reconcile: true,           // SnapDOM 像素级精确布局（防文本重排；约双倍耗时）
  bottomPadding: 40,         // 底部留白最终兜底值（px）
  minBottomPadding: 10,      // 底部留白下边界（px）：动态结果小于此值时保底抬升，保证始终有可见留白
  maxBottomPadding: 40,      // 底部留白上边界（px）：动态结果大于此值时压回，防止异常 DOM 导致留白过大
  showCornerBtn: false,      // true = 额外显示右上角 📸 按钮（菜单注入失败兜底）
  reflow: true               // 多图重排总开关（适配器声明 site.reflow 才生效；B站横向图集 → 网格）
};

const site = getActiveSite();
if (!site) {
  console.warn('[dynshot] 当前页面无站点适配器，脚本不生效');
} else {
  main();
}

function main() {
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ---------- Toast ----------
  let toastEl, toastTimer;
  function toast(msg, type, ms) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      Object.assign(toastEl.style, {
        position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)',
        zIndex: 99999, padding: '8px 16px', borderRadius: '8px', fontSize: '13px',
        color: '#fff', background: 'rgba(30,30,30,.92)', boxShadow: '0 4px 12px rgba(0,0,0,.2)',
        transition: 'opacity .25s', pointerEvents: 'none', whiteSpace: 'nowrap'
      });
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.background = type === 'error' ? '#d64545' : type === 'ok' ? '#16a34a' : '#1e1e1e';
    toastEl.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.style.opacity = '0'; }, ms || 2600);
  }

  // ---------- 目标卡片收集 ----------
  const collectTargets = () => [...document.querySelectorAll(site.targetSel)];

  // ---------- SnapDOM 下载封装 ----------
  async function downloadCard(el, filename) {
    if (typeof window.snapdom === 'undefined') throw new Error('截图引擎未加载，请刷新页面重试');
    el.querySelectorAll('video, audio').forEach(v => { try { v.pause(); } catch (e) { /* 忽略 */ } });
    await window.snapdom.download(el, {
      scale: CFG.scale,
      dpr: 1,
      filename: filename,
      exclude: site.exclude,
      backgroundColor: '#ffffff',
      reconcile: CFG.reconcile
    });
  }

  // ---------- 底部留白动态计算 ----------
  // 优先级：paddingFn > paddingRef × paddingRatio > CFG.bottomPadding
  // 高度逻辑：容器上界 → 头像位置的距离（适配器 paddingFn 原值，不再放大）；
  // 结果收敛在 [minBottomPadding, maxBottomPadding] 上下边界内（保底 10px / 上限防异常）。
  // clamp 语义：0/负值/NaN 视为"有效但极小"→ 收敛到保底 10px（不会无留白，也不会跳到过高兜底）；
  // 仅 null/undefined/抛异常 视为"无结果"→ 继续走下一级兜底链。
  function calcBottomPadding(el) {
    const clamp = (v) => {
      if (v === null || v === undefined) return null;   // 无结果 → 走下一级
      const n = Math.round(Number(v));
      if (!Number.isFinite(n) || n <= 0) return CFG.minBottomPadding;  // 0/负/NaN → 保底下边界
      return Math.max(CFG.minBottomPadding, Math.min(n, CFG.maxBottomPadding));
    };
    if (typeof site.paddingFn === 'function') {
      let v = null;
      try { v = site.paddingFn(el); } catch (e) { v = null; }
      const p = clamp(v);
      if (p !== null) return p;
    }
    if (site.paddingRef) {
      const refEl = el.querySelector(site.paddingRef);
      if (refEl && refEl.offsetHeight > 0) {
        const mb = parseFloat(getComputedStyle(refEl).marginBottom) || 0;
        const ratio = site.paddingRatio || 1;
        const p = clamp((refEl.offsetHeight + mb) * ratio);
        if (p !== null) return p;
      }
    }
    return CFG.bottomPadding;
  }

  // ---------- 底部留白应用：临时给卡片加 padding-bottom，截后恢复 ----------
  // 返回 null（无留白/应用失败）或 { el, cleanup }（inline padding 生效）或 { el, wrap, cleanup }（CSS 阻挡时降级包装器）。
  // 验证方式：读取 computed padding-bottom，若被 CSS !important 覆盖则计算值 ≠ 目标值，此时降级。
  function applyBottomPadding(el, pad) {
    if (!(pad > 0)) return null;
    const origPad = el.style.paddingBottom;
    el.style.paddingBottom = pad + 'px';
    // 强制同步重排并读取计算值（此时 layout 已更新）
    const actual = parseFloat(getComputedStyle(el).paddingBottom) || 0;
    if (Math.abs(actual - pad) < 1) {
      return { el, cleanup: () => { el.style.paddingBottom = origPad; } };
    }
    // inline 被 CSS 吞掉（如 padding-bottom !important）→ 还原后降级包装器
    el.style.paddingBottom = origPad;
    try {
      return applyPadViaWrapper(el, pad);
    } catch (e) {
      console.warn('[dynshot] 包装器方案失败，跳过底部留白', e);
      return null;
    }
  }

  // 包装器方案：把卡片包一层带 padding-bottom 的白底 div，对包装器截图
  // —— 不受卡片自身 padding/box-sizing/固定高度/overflow 影响，留白必定渲染。
  function applyPadViaWrapper(el, pad) {
    const cs = getComputedStyle(el);
    const wrap = document.createElement('div');
    wrap.setAttribute('data-ds-pad-wrap', '');
    wrap.style.cssText =
      'box-sizing:border-box;' +
      'margin:' + cs.marginTop + ' ' + cs.marginRight + ' ' + cs.marginBottom + ' ' + cs.marginLeft + ';' +
      'width:' + Math.max(1, el.offsetWidth) + 'px;' +
      'padding-bottom:' + pad + 'px;' +
      'background:#ffffff;';
    // 临时清掉卡片 margin（转移到包装器），避免父级 margin 折叠导致布局/尺寸漂移
    const saved = {
      margin: el.style.margin, marginTop: el.style.marginTop, marginRight: el.style.marginRight,
      marginBottom: el.style.marginBottom, marginLeft: el.style.marginLeft
    };
    el.style.margin = '0';
    el.parentNode.insertBefore(wrap, el);
    wrap.appendChild(el);
    return {
      el, wrap,
      cleanup() {
        el.style.margin = saved.margin;
        el.style.marginTop = saved.marginTop;
        el.style.marginRight = saved.marginRight;
        el.style.marginBottom = saved.marginBottom;
        el.style.marginLeft = saved.marginLeft;
        if (wrap.parentNode) {
          wrap.parentNode.insertBefore(el, wrap);
          wrap.remove();
        }
      }
    };
  }

  // ---------- 多图重排（参考 bili2tieba snapshot._REFLOW_GALLERY_JS） ----------
  // 卡片内横向滑动图集（如 B站 .bili-dyn-gallery）截图时只露出首张图，其余被裁掉；
  // 截图前把 gallery 重排为 N 列网格矩阵（所有图片平铺），截后完整还原。
  // 适配器声明 site.reflow 即启用；gallerySel 必填，columns/gap/maxWidth/stripParams 可选。
  // 页面变更集中在最后两步（隐藏 gallery + 插入网格），中途异常不留半成品 DOM。
  function applyReflow(el) {
    const r = site.reflow;
    if (CFG.reflow === false || !r || !r.gallerySel) return null;
    let gallery = null, grid = null, prevDisplay = '';
    try {
      gallery = el.querySelector(r.gallerySel);
      if (!gallery || !gallery.parentNode) return null;
      const urls = [...gallery.querySelectorAll('img')].map(img => {
        const s = img.currentSrc || img.src || '';
        return (r.stripParams === false) ? s : s.split('@')[0];
      }).filter(Boolean);
      if (urls.length < 2) return null;   // 单图/无图无需重排
      grid = document.createElement('div');
      grid.className = 'bs-reflow-grid';
      grid.style.cssText = 'display:grid;' +
        'grid-template-columns:repeat(' + (r.columns || 3) + ',1fr);' +
        'gap:' + (r.gap || 6) + 'px;' +
        'width:100%;max-width:' + (r.maxWidth || 540) + 'px;' +
        'margin-top:10px;';
      urls.forEach(u => {
        const cell = document.createElement('div');
        cell.style.cssText = 'aspect-ratio:1/1;overflow:hidden;border-radius:6px;background:#f1f2f3;';
        const img = document.createElement('img');
        img.src = u;
        img.loading = 'eager';
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
        cell.appendChild(img);
        grid.appendChild(cell);
      });
      prevDisplay = gallery.style.display;
      gallery.style.display = 'none';
      gallery.parentNode.insertBefore(grid, gallery.nextSibling);
      return {
        grid, count: urls.length,
        cleanup: () => {
          grid.remove();
          gallery.style.display = prevDisplay || '';
        }
      };
    } catch (e) {
      console.warn('[dynshot] 多图重排失败，已跳过', e);
      if (grid && grid.parentNode) { try { grid.remove(); } catch (e2) { /* 忽略 */ } }
      if (gallery && prevDisplay) { try { gallery.style.display = prevDisplay || ''; } catch (e2) { /* 忽略 */ } }
      return null;
    }
  }

  // ---------- 截图主流程（不滚动页面） ----------
  async function shotTarget(el, id) {
    if (window.__dsBusy) { toast('已有截图进行中，请稍候', 'info', 1500); return; }
    if (el._busy) return;
    window.__dsBusy = true;
    el._busy = true;
    const t0 = performance.now();
    let padCtx = null;    // 底部留白上下文（可能为包装器）
    let reflowCtx = null; // 多图重排上下文
    try {
      console.info('[dynshot] ▶ 开始截图 id=' + id);

      // 不滚动页面；主动触发卡片内懒加载图片
      el.querySelectorAll('img').forEach(img => {
        try {
          img.loading = 'eager';
          const lazy = img.getAttribute('data-src') || img.getAttribute('data-original');
          if (lazy && !img.getAttribute('src')) img.setAttribute('src', lazy);
        } catch (e) { /* 忽略 */ }
      });

      // 多图重排：横向滑动图集 → N 列网格矩阵（在懒加载触发之后读取图片地址，截后还原）
      reflowCtx = applyReflow(el);
      if (reflowCtx) console.info('[dynshot] 多图重排：' + reflowCtx.count + ' 张图片已平铺为网格');

      await sleep(CFG.waitMs);

      // 底部留白（动态计算 + 应用 + 验证）
      const pad = calcBottomPadding(el);
      if (pad > 0) {
        padCtx = applyBottomPadding(el, pad);
        await sleep(80);
        if (padCtx && padCtx.wrap) {
          console.info('[dynshot] 底部留白 ' + pad + 'px（inline padding 被 CSS 覆盖，已用包装器方案保证渲染）');
        } else if (padCtx) {
          console.info('[dynshot] 底部留白 ' + pad + 'px（inline padding 已生效）');
        } else {
          console.warn('[dynshot] 底部留白 ' + pad + 'px 应用失败，本次截图无留白');
        }
      } else {
        console.info('[dynshot] 底部留白计算无有效值，跳过');
      }

      const shotEl = (padCtx && padCtx.wrap) ? padCtx.wrap : el;
      const filename = (site.filePrefix || 'shot_') + id + '_' + Date.now() + '.png';
      await downloadCard(shotEl, filename);
      console.info('[dynshot] ✅ 完成，耗时 ' + Math.round(performance.now() - t0) + 'ms');
      toast('✅ 已保存 PNG', 'ok');
    } catch (e) {
      console.error('[dynshot] ❌', e);
      toast('截图失败：' + (e.message || e), 'error', 4000);
    } finally {
      if (padCtx && typeof padCtx.cleanup === 'function') padCtx.cleanup();
      if (reflowCtx && typeof reflowCtx.cleanup === 'function') reflowCtx.cleanup();
      el._busy = false;
      window.__dsBusy = false;
    }
  }

  // ---------- 跳转式截图（适配器声明：opus 页 → t.bilibili.com 旧版动态页） ----------
  function redirectShot(url, id) {
    console.info('[dynshot] ▶ 跳转截图（opus 页 → 旧版动态页）id=' + id + ' → ' + url);
    toast('正在跳转 t.bilibili.com 截图…', 'info', 2000);
    const w = window.open(url, '_blank');
    if (!w) {
      // 弹窗被拦截：退化为当前标签跳转（截图完成后页面保留，用户手动关闭）
      toast('弹窗被拦截，改为当前页跳转', 'info', 2500);
      location.href = url;
    }
  }

  // 统一截图入口：适配器声明跳转则跳转，否则就地截图
  function decideShot(target) {
    const id = site.didOf(target);
    if (!id) { toast('未找到卡片 ID，请重试', 'error'); return; }
    const via = (typeof site.shotRedirect === 'function') ? site.shotRedirect(target) : null;
    if (via) redirectShot(via, id);
    else shotTarget(target, id);
  }

  // ---------- 菜单项创建 ----------
  function closeMenu(panel, el) {
    const btn = (el && el.querySelector('[class*="more"][class*="btn"]')) ||
      panel.querySelector('[class*="more"][class*="btn"]');
    if (btn) btn.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    else panel.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
  }

  function createMenuEntry(text, onClick, panel, el) {
    const ref = [...panel.children].find(c =>
      c.nodeType === 1 &&
      !c.classList.contains('bs-entry') &&
      site.menuItemClassRe.test(c.className)
    ) || [...panel.children].find(c =>
      c.nodeType === 1 && !c.classList.contains('bs-entry') && c.textContent.trim()
    );

    const item = document.createElement('div');
    item.className = (ref ? ref.className + ' ' : '') + 'bs-entry';
    if (ref) {
      ref.getAttributeNames().forEach(a => {
        if (a === 'id') return;
        if (a.startsWith('data-') || a === 'style') item.setAttribute(a, ref.getAttribute(a));
      });
    }
    item.textContent = text;
    if (ref) {
      try {
        const cs = getComputedStyle(ref);
        ['color', 'fontSize', 'fontWeight', 'fontFamily', 'lineHeight', 'whiteSpace',
          'textAlign', 'padding', 'display', 'alignItems', 'gap', 'height', 'letterSpacing'].forEach(pr => {
            const v = cs.getPropertyValue(pr);
            if (v) item.style.setProperty(pr, v);
          });
      } catch (e) { /* 忽略 */ }
    } else {
      Object.assign(item.style, {
        padding: '10px 16px', fontSize: '13px', color: '#18191c',
        lineHeight: '1.4', whiteSpace: 'nowrap', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: '6px', userSelect: 'none'
      });
    }
    item.addEventListener('click', e => {
      e.stopPropagation(); e.preventDefault();
      onClick();
      closeMenu(panel, el);
    });
    return item;
  }

  // 动态绑定：点击时取 lastTarget（当前打开菜单的卡片），位置固定
  let lastTarget = null;
  function appendEntry(panel, el) {
    if (panel.querySelector('.bs-entry')) return;
    const onClick = () => {
      const target = (lastTarget && lastTarget.isConnected) ? lastTarget : el;
      decideShot(target);
    };
    const item = createMenuEntry(site.menuText, onClick, panel, el);
    if (!item) return;
    panel.appendChild(item);
  }

  // 卡片内面板注入（含 cascader 触发容器）
  function injectCardPanel(el) {
    const panel = el.querySelector(site.menuPanelSel);
    if (!panel) return;
    if (panel.classList.contains('bili-dyn-item__more') || panel.classList.contains('opus-more')) {
      const options = panel.querySelector(site.cascaderOptionsSel);
      if (options) appendEntry(options, el);
    } else {
      appendEntry(panel, el);
    }
  }

  // 全局兜底：所有面板/级联浮层
  function injectAnywhere() {
    document.querySelectorAll(site.menuPanelSel).forEach(panel => {
      if (panel.querySelector('.bs-entry')) return;
      const el = panel.closest(site.targetSel) || lastTarget || collectTargets()[0];
      if (!el) return;
      if (panel.classList.contains('bili-dyn-item__more') || panel.classList.contains('opus-more')) {
        const options = panel.querySelector(site.cascaderOptionsSel);
        if (options) appendEntry(options, el);
      } else {
        appendEntry(panel, el);
      }
    });
    if (site.cascaderOptionsSel) {
      document.querySelectorAll(site.cascaderOptionsSel).forEach(options => {
        if (options.querySelector('.bs-entry')) return;
        const el = lastTarget || collectTargets()[0];
        if (!el) return;
        appendEntry(options, el);
      });
    }
  }

  // ---------- 右上角兜底按钮 ----------
  function addCornerBtn(el) {
    if (el.querySelector('.bs-btn')) return;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'bs-btn'; b.textContent = '📸'; b.title = '截图';
    Object.assign(b.style, {
      position: 'absolute', top: '0', right: '0', zIndex: 999,
      background: 'rgba(0,0,0,.45)', color: '#fff', border: 'none',
      borderRadius: '0 0 0 8px', width: '30px', height: '30px', fontSize: '15px',
      cursor: 'pointer', userSelect: 'none'
    });
    b.addEventListener('click', e => {
      e.stopPropagation(); e.preventDefault();
      decideShot(el);
    });
    el.appendChild(b);
  }

  // ---------- 卡片设置（轻量：无 observer，仅点击兜底） ----------
  function setupCard(el) {
    if (el._bsSetup) return;
    el._bsSetup = true;
    injectCardPanel(el);
    el.addEventListener('click', e => {
      const isMore = e.target.closest(site.menuPanelSel) ||
        (site.cascaderOptionsSel && e.target.closest(site.cascaderOptionsSel)) ||
        (e.target.closest('[class]') && site.moreBtnRe.test(e.target.closest('[class]').className));
      if (isMore) {
        setTimeout(() => {
          const ok = el.querySelector('.bs-entry') ||
            (site.cascaderOptionsSel && document.querySelector(site.cascaderOptionsSel + ' .bs-entry'));
          if (!ok) {
            addCornerBtn(el);
            console.warn('[dynshot] 菜单注入失败，已启用右上角按钮兜底');
            toast('菜单注入失败，已启用右上角按钮', 'info', 2500);
          }
        }, 1200);
      }
    }, true);
  }

  // ---------- 初始化（性能优化：单 observer + 节流 + 低频兜底） ----------
  function init() {
    const scan = () => {
      collectTargets().forEach(el => {
        if (!site.didOf(el)) return;
        if (site.inject !== 'corner') setupCard(el);
        if (site.inject !== 'menu' || CFG.showCornerBtn) addCornerBtn(el);
      });
    };
    setTimeout(scan, 300);

    // 单个全局 observer，100ms 节流合并（替代每卡片 observer + 高频扫描）
    const root = (site.feedContainerSel && document.querySelector(site.feedContainerSel)) || document.body;
    let pending = false;
    const flush = () => {
      pending = false;
      scan();
      injectAnywhere();
    };
    new MutationObserver(() => {
      if (pending) return;
      pending = true;
      setTimeout(flush, 100);
    }).observe(root, { childList: true, subtree: true });

    // 菜单浮层多为点击后异步渲染（常出现在 body 下，observer 观察不到），
    // 点击"更多"后立即注入一次 + 轮询重试 ~1s，避免单次注入扑空后干等 15s 低频兜底
    let injectTimer = null;
    const pollInject = (times, delay) => {
      clearInterval(injectTimer);
      let tries = 0;
      injectTimer = setInterval(() => {
        injectAnywhere();
        tries++;
        if (tries >= times) { clearInterval(injectTimer); injectTimer = null; }
      }, delay);
    };

    // 点击"更多"→ 更新 lastTarget + 立即注入 + 轮询重试
    document.addEventListener('click', e => {
      const more = e.target.closest(site.menuPanelSel) ||
        (site.cascaderOptionsSel && e.target.closest(site.cascaderOptionsSel)) ||
        (e.target.closest('[class]') && site.moreBtnRe.test(e.target.closest('[class]').className));
      if (more) {
        const c = more.closest ? more.closest(site.targetSel) : null;
        if (c) lastTarget = c;
        injectAnywhere();   // 浮层已渲染时零延迟注入
        pollInject(9, 100); // 未渲染则轮询重试（约 0.9s 窗口）
      }
    }, true);

    // 低频兜底（observer 失效时）
    setInterval(scan, 15000);
    console.log('[dynshot] 站点「' + site.name + '」已加载');
  }

  // ---------- 启动 ----------
  init();

  // 自动截图：URL 含适配器声明的参数时，自动截第一个目标
  const params = new URLSearchParams(location.search);
  if ((site.autoParams || []).some(p => params.has(p))) {
    console.info('[dynshot] ▶ 自动截图模式（参数命中）');
    (async () => {
      // 等待目标卡片渲染（跳转页可能懒加载，最多重试约 6s）
      let target = null;
      for (let i = 0; i < 10; i++) {
        target = collectTargets()[0];
        if (target) break;
        await sleep(600);
      }
      if (!target) { toast('未找到目标卡片（跳转页可能已改版）', 'error', 4000); return; }
      const id = site.didOf(target);
      if (id) await shotTarget(target, id);
      setTimeout(() => { try { window.close(); } catch (e) { /* 忽略 */ } }, 1500);
    })();
  }
}