# Changelog

## [v0.0.1] - 2026-08-14
### Fixed
- **修复底部留白可能完全失效**：**paddingFn** 返回 0（B站头像贴顶等）时会被 "v >= 0" 接受并短路兜底链，导致截图底部完全没有留白。现 0/负值会收敛到保底下边界（10px），null/undefined/异常视为无结果继续走 **paddingRef** / **CFG.bottomPadding** 兜底。
- **paddingFn 头像查找更精准**：优先在卡片 header 内查找头像，避免误匹配正文/转发/评论区头像导致留白高度异常。
- **留白被 CSS 吞掉时自动降级**：inline padding-bottom 应用后校验计算值是否生效；若被 padding-bottom !important 等 CSS 覆盖，自动切换为「包装器方案」（临时包一层白底 padding div 再截图），保证留白必定渲染，截后完整还原 DOM。

### Changed
- 底部留白动态计算完善：
  - **高度逻辑**：留白 = 容器上界 → 头像位置的距离（适配器 **paddingFn** 原值，不再放大/抬升）。
  - 新增上下边界：**CFG.minBottomPadding**（下边界，默认 10px 保底）与 **CFG.maxBottomPadding**（上边界，默认 40px 防异常），动态结果收敛在 [10, 40] 内。
  - 计算全程容错（try/catch），单点异常不影响兜底链。
- 截图日志输出留白诊断：目标留白值、inline 是否生效、是否启用包装器方案，便于确认功能是否正常执行。
- extension/content.js、extension/sites.js、dynshot.js（油猴版）同步更新。

