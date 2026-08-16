# Changelog

## [v0.0.1] - 2026-08-14
### Added
- **多图重排（参考 bili2tieba snapshot._REFLOW_GALLERY_JS）**：横向滑动图集（如 B站 `.bili-dyn-gallery`）截图时只露出首张图，其余被裁掉；现截图前自动将 gallery 重排为 N 列网格矩阵（所有图片平铺可见），截后完整还原。
- 适配器新增可选字段 `reflow`：`{ gallerySel, columns, gap, maxWidth, stripParams }`（`gallerySel` 必填）；B站适配器已配置 3 列 / 6px 间距 / 540px 宽 / 去 '@' 压缩参数。
- `CFG.reflow`（默认 true）总开关；适配器未声明 `reflow` 时功能自动跳过，其他网站零影响。

### Fixed
- **修复「截图动态」菜单项注入慢的问题**：B站「更多」菜单浮层是点击后才异步渲染的（常出现在 body 下，observer 观察不到），原实现只做单次 100ms 后注入，浮层未渲染时注入扑空，只能干等 15s 低频兜底扫描。
- 点击「更多」后改为**立即注入 + 轮询重试**（约 1s 窗口、10 次幂等注入，`.bs-entry` 防重复），浮层一出现即完成注入，感知延迟从秒级降至亚秒级。
- 首次卡片扫描 800ms → 300ms；菜单注入失败兜底按钮的判定时机 900ms → 1200ms（与轮询窗口协调，避免浮层晚渲染时误挂右上角按钮）。

### Changed
- `shotTarget` 流程升级：懒加载触发 → 多图重排 → 等待图片加载 → 底部留白 → SnapDOM 捕获；finally 先还原留白再移除重排网格，页面完全复原。
- 重排按**卡片内查找**（`el.querySelector`）而非全局查找，瀑布流多卡片互不干扰；页面变更集中在最后两步，中途异常不残留半成品 DOM。
- 截图日志输出重排诊断（重排张数）；extension/content.js、extension/sites.js、dynshot.js（油猴版）同步更新。
- `test/logic-test.js` 新增 applyReflow 单测（16 项），extractFn 升级为字符串/注释感知的括号配平提取。

