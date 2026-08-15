// dynshot.js 打包脚本：保持头部（UserScript 注释 + SnapDOM IIFE）不变，
// 用 extension/sites.js + extension/content.js 重新组装 IIFE 二（站点适配器 + 通用核心）。
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const bundlePath = path.join(root, 'dynshot.js');
const bundle = fs.readFileSync(bundlePath, 'utf8');
const marker = '/* ===== 二、站点适配器 + 通用核心（IIFE） ===== */';
const idx = bundle.indexOf(marker);
if (idx < 0) throw new Error('marker not found in bundle');
const header = bundle.slice(0, idx) + marker + '\n(function () {\n\'use strict\';\n';
const sites = fs.readFileSync(path.join(root, 'extension', 'sites.js'), 'utf8');
const content = fs.readFileSync(path.join(root, 'extension', 'content.js'), 'utf8');
const out = header + sites + '\n' + content + '\n})();\n';
fs.writeFileSync(bundlePath, out);
console.log('bundle rewritten, length=' + out.length);
