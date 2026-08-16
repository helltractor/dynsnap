'use strict';
// 底部留白逻辑单测：从 extension/content.js 提取真实函数实现进行验证
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content.js'), 'utf8');

function extractFn(name) {
  const head = 'function ' + name + '(';
  const start = src.indexOf(head);
  if (start < 0) throw new Error('cannot extract ' + name);
  let i = src.indexOf('{', start);
  if (i < 0) throw new Error('cannot extract ' + name);
  let depth = 0;
  let quote = null;        // null | ' | " | `
  let tplDepth = 0;        // 模板字符串内 ${} 嵌套深度
  let lineComment = false, blockComment = false;
  for (; i < src.length; i++) {
    const ch = src[i], next = src[i + 1];
    if (lineComment) { if (ch === '\n') lineComment = false; continue; }
    if (blockComment) { if (ch === '*' && next === '/') { blockComment = false; i++; } continue; }
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (quote === '`' && ch === '$' && next === '{') { tplDepth++; continue; }
      if (quote === '`' && ch === '}' && tplDepth > 0) { tplDepth--; continue; }
      if (ch === quote && tplDepth === 0) quote = null;
      continue;
    }
    if (ch === '/' && next === '/') { lineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { blockComment = true; i++; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('cannot extract ' + name);
}

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + ' → 期望 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual)); }
}
function ok(cond, label) { eq(!!cond, true, label); }

// ---------- calcBottomPadding 测试 ----------
const calcSrc = extractFn('calcBottomPadding');
const CFG = { bottomPadding: 40, minBottomPadding: 10, maxBottomPadding: 40 };

function makeEl({ headerH, hasRef }) {
  const el = { offsetHeight: 300 };
  el.querySelector = (sel) => {
    if (sel === '.bili-dyn-item__header' || sel.includes('header')) {
      if (!hasRef) return null;
      return { offsetHeight: headerH };
    }
    return null;
  };
  return el;
}

function runCalc(siteOverrides, el) {
  const site = Object.assign({ paddingFn: null, paddingRef: null, paddingRatio: 1 }, siteOverrides);
  const fn = new Function('CFG', 'site', 'getComputedStyle', 'return ' + calcSrc + ';');
  return fn(CFG, site, () => ({ marginBottom: '0px' }))(el);
}

console.log('calcBottomPadding 测试（上下边界 [10, 40]）：');
// 高度逻辑：容器上界→头像距离原值，不再放大
eq(runCalc({ paddingFn: () => 16, paddingRef: null }, makeEl({})), 16, 'paddingFn=16 原样采用（不放大）');
eq(runCalc({ paddingFn: () => 30, paddingRef: null }, makeEl({})), 30, 'paddingFn=30 保持 30');
eq(runCalc({ paddingFn: () => 16.6, paddingRef: null }, makeEl({})), 17, 'paddingFn=16.6 取整为 17');
// 下边界保底 10
eq(runCalc({ paddingFn: () => 5, paddingRef: null }, makeEl({})), 10, 'paddingFn=5 保底到 10');
eq(runCalc({ paddingFn: () => 0, paddingRef: null }, makeEl({})), 10, 'paddingFn=0（头像贴顶）保底到 10');
eq(runCalc({ paddingFn: () => 0, paddingRef: '.bili-dyn-item__header', paddingRatio: 0.6 }, makeEl({ headerH: 64, hasRef: true })), 10, 'paddingFn=0 直接保底 10，不走 paddingRef');
eq(runCalc({ paddingFn: () => -5, paddingRef: null }, makeEl({})), 10, 'paddingFn=-5 保底到 10');
eq(runCalc({ paddingFn: () => null, paddingRef: '.bili-dyn-item__header', paddingRatio: 0.6 }, makeEl({ headerH: 16, hasRef: true })), 10, 'paddingRef=9.6 保底到 10');
// 上边界压回 40
eq(runCalc({ paddingFn: () => 100, paddingRef: null }, makeEl({})), 40, 'paddingFn=100 压回上边界 40');
eq(runCalc({ paddingFn: () => null, paddingRef: '.bili-dyn-item__header', paddingRatio: 0.6 }, makeEl({ headerH: 200, hasRef: true })), 40, 'paddingRef=120 压回上边界 40');
// 兜底链：null/undefined/异常 → paddingRef → bottomPadding
eq(runCalc({ paddingFn: () => null, paddingRef: '.bili-dyn-item__header', paddingRatio: 0.6 }, makeEl({ headerH: 64, hasRef: true })), 38, 'paddingFn=null 走 paddingRef 兜底 38');
eq(runCalc({ paddingFn: () => { throw new Error('x'); }, paddingRef: '.bili-dyn-item__header', paddingRatio: 0.6 }, makeEl({ headerH: 64, hasRef: true })), 38, 'paddingFn 抛异常走 paddingRef 兜底 38');
eq(runCalc({ paddingFn: () => undefined, paddingRef: null }, makeEl({})), 40, 'paddingFn=undefined 无结果 → 最终兜底 40');

// ---------- applyBottomPadding / applyPadViaWrapper 测试 ----------
const applySrc = extractFn('applyBottomPadding');
const wrapSrc = extractFn('applyPadViaWrapper');

function makeDom({ inlineWorks = true, fixedComputedPad = 6 } = {}) {
  const parent = { children: [], parentNode: null };
  let padPx = 0;
  const el = { offsetWidth: 600, parentNode: parent, style: {} };
  Object.defineProperty(el.style, 'paddingBottom', {
    get: () => (padPx ? padPx + 'px' : ''),
    set: (v) => { padPx = v ? parseFloat(v) : 0; }
  });
  Object.defineProperty(el.style, 'margin', { get: () => '', set: () => {} });
  ['marginTop','marginRight','marginBottom','marginLeft'].forEach(k => {
    Object.defineProperty(el.style, k, { get: () => '', set: () => {} });
  });
  const getComputedStyle = (node) => {
    if (node === el) {
      const effective = inlineWorks ? padPx : fixedComputedPad;
      return { paddingBottom: effective + 'px', marginTop: '0px', marginRight: '0px', marginBottom: '8px', marginLeft: '0px' };
    }
    return { paddingBottom: '0px' };
  };
  const detach = (node) => {
    if (node.parentNode && node.parentNode.children) {
      const i = node.parentNode.children.indexOf(node);
      if (i >= 0) node.parentNode.children.splice(i, 1);
    }
    node.parentNode = null;
  };
  parent.insertBefore = (node, ref) => {
    detach(node);
    node.parentNode = parent;
    const idx = ref ? parent.children.indexOf(ref) : -1;
    if (idx >= 0) parent.children.splice(idx, 0, node); else parent.children.push(node);
  };
  parent.removeChild = (node) => { detach(node); };
  const doc = {
    createElement: () => {
      const w = { style: {}, parentNode: null, children: [] };
      w.appendChild = (child) => {
        detach(child);
        child.parentNode = w;
        w.children.push(child);
      };
      w.remove = () => { if (w.parentNode) w.parentNode.removeChild(w); };
      w.setAttribute = () => {};
      return w;
    }
  };
  return { el, parent, doc, getComputedStyle };
}

function runApply(el, pad, env) {
  const body = applySrc + '\n' + wrapSrc + '\nreturn { applyBottomPadding: applyBottomPadding, applyPadViaWrapper: applyPadViaWrapper };';
  const fn = new Function('document', 'getComputedStyle', body);
  return fn(env.doc, env.getComputedStyle).applyBottomPadding(el, pad);
}

console.log('applyBottomPadding 测试：');
{
  const env = makeDom({ inlineWorks: true });
  const ctx = runApply(env.el, 16, env);
  ok(!!ctx && !ctx.wrap, 'inline 生效时不创建包装器');
  eq(env.el.style.paddingBottom, '16px', '卡片 padding-bottom 已设置 16px');
  ctx.cleanup();
  eq(env.el.style.paddingBottom, '', 'cleanup 后 padding 恢复');
}
{
  const env = makeDom({ inlineWorks: true });
  const ctx = runApply(env.el, 16, env);
  ok(!!ctx && !ctx.wrap, '原有 CSS padding 存在时 inline 覆盖仍生效，不误判降级');
}
{
  const env = makeDom({ inlineWorks: false, fixedComputedPad: 6 });
  const ctx = runApply(env.el, 16, env);
  ok(!!ctx && !!ctx.wrap, '被 !important 覆盖时降级为包装器');
  ok(env.parent.children.length === 1 && env.parent.children[0] === ctx.wrap, '包装器插入父容器');
  eq(env.el.style.paddingBottom, '', '卡片自身 padding 已还原');
  ok(env.el.parentNode === ctx.wrap, '卡片已移入包装器');
  ctx.cleanup();
  ok(env.parent.children.length === 1 && env.parent.children[0] === env.el, 'cleanup 后包装器移除、卡片归位');
  ok(env.el.parentNode === env.parent, 'cleanup 后卡片 parentNode 正确');
}
{
  const env = makeDom({});
  eq(runApply(env.el, 0, env), null, 'pad=0 返回 null');
}
{
  const env = makeDom({ inlineWorks: false });
  const orphan = { offsetWidth: 600, parentNode: null, style: { paddingBottom: '', margin: '', marginTop: '', marginRight: '', marginBottom: '', marginLeft: '' } };
  const ctx = runApply(orphan, 16, env);
  eq(ctx, null, '包装器失败时返回 null（不抛错）');
}

// ---------- applyReflow 测试（多图重排，移植自 bili2tieba snapshot._REFLOW_GALLERY_JS） ----------
const reflowSrc = extractFn('applyReflow');

function makeReflowEnv({ galleryImgs = 3, hasGallery = true } = {}) {
  const node = (tag) => ({
    tagName: tag, style: {}, children: [], parentNode: null, nextSibling: null,
    className: '', remove() { if (this.parentNode && this.parentNode.removeChild) this.parentNode.removeChild(this); }
  });
  const detach = (n) => {
    if (n.parentNode && n.parentNode.children) {
      const i = n.parentNode.children.indexOf(n);
      if (i >= 0) n.parentNode.children.splice(i, 1);
    }
    n.parentNode = null;
  };
  const parent = node('div');
  parent.insertBefore = (n, ref) => {
    detach(n);
    n.parentNode = parent;
    if (ref) {
      const idx = parent.children.indexOf(ref);
      parent.children.splice(idx >= 0 ? idx : parent.children.length, 0, n);
    } else parent.children.push(n);
  };
  parent.removeChild = (n) => { detach(n); };
  const gallery = node('div');
  const imgs = [];
  for (let k = 0; k < galleryImgs; k++) {
    const img = node('img');
    img.currentSrc = 'https://i0.hdslb.com/bfs/dyn/abc' + k + '@123w_123h.webp';
    img.src = '';
    imgs.push(img);
    gallery.children.push(img);
    img.parentNode = gallery;
  }
  gallery.querySelectorAll = (sel) => (sel === 'img') ? imgs.slice() : [];
  gallery.parentNode = parent;
  parent.children.push(gallery);
  const el = node('div');
  el.querySelector = (sel) => (hasGallery && sel === '.bili-dyn-gallery') ? gallery : null;
  const doc = {
    createElement: () => {
      const n = node('div');
      n.appendChild = (child) => { detach(child); child.parentNode = n; n.children.push(child); };
      n.remove = () => { if (n.parentNode && n.parentNode.removeChild) n.parentNode.removeChild(n); };
      return n;
    }
  };
  return { el, gallery, parent, doc };
}

function runReflow(env, siteReflow, cfgReflow) {
  const site = { reflow: siteReflow };
  const CFG = { reflow: cfgReflow !== undefined ? cfgReflow : true };
  const body = reflowSrc + '\nreturn applyReflow;';
  const fn = new Function('site', 'CFG', 'document', body);
  return fn(site, CFG, env.doc)(env.el);
}

console.log('applyReflow 测试（多图重排）：');
{
  const env = makeReflowEnv({});
  const ctx = runReflow(env, { gallerySel: '.bili-dyn-gallery', columns: 3 });
  ok(!!ctx, '3 图时返回重排上下文');
  eq(env.gallery.style.display, 'none', '原 gallery 已隐藏');
  eq(env.parent.children.length, 2, '网格已插入父容器（gallery + grid）');
  eq(env.parent.children[1].children.length, 3, '网格包含 3 个单元格');
  const firstImg = env.parent.children[1].children[0].children[0];
  eq(firstImg.src, 'https://i0.hdslb.com/bfs/dyn/abc0', '图片 URL 去掉 @ 后 CDN 压缩参数（取原图）');
  eq(firstImg.loading, 'eager', '网格图片 eager 加载');
  ctx.cleanup();
  eq(env.gallery.style.display, '', 'cleanup 后 gallery 恢复原 display');
  eq(env.parent.children.length, 1, 'cleanup 后网格已移除');
}
{
  const env = makeReflowEnv({});
  eq(runReflow(env, null), null, '适配器未声明 reflow 时跳过');
  eq(runReflow(env, { gallerySel: '.bili-dyn-gallery' }, false), null, 'CFG.reflow=false 总开关关闭时跳过');
}
{
  const env = makeReflowEnv({ hasGallery: false });
  eq(runReflow(env, { gallerySel: '.bili-dyn-gallery' }), null, '卡片内无 gallery 时跳过');
}
{
  const env = makeReflowEnv({ galleryImgs: 1 });
  eq(runReflow(env, { gallerySel: '.bili-dyn-gallery' }), null, '单图不重排');
}
{
  const env = makeReflowEnv({});
  const ctx = runReflow(env, { gallerySel: '.bili-dyn-gallery', columns: 2, gap: 10, stripParams: false });
  ok(!!ctx, '自定义 columns/gap/stripParams 生效');
  ok(env.parent.children[1].style.cssText.indexOf('repeat(2,1fr)') >= 0, '列数使用配置值 2');
  ok(env.parent.children[1].style.cssText.indexOf('gap:10px') >= 0, '间距使用配置值 10px');
  const firstImg = env.parent.children[1].children[0].children[0];
  eq(firstImg.src, 'https://i0.hdslb.com/bfs/dyn/abc0@123w_123h.webp', 'stripParams=false 保留完整 URL');
}
{
  const env = makeReflowEnv({});
  eq(runReflow(env, { gallerySel: '.bili-dyn-gallery' }, true).count, 3, '返回 count = 图片数量');
}

console.log('');
console.log('结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
