/**
 * 截图配置的领域模型（纯类型，无运行时依赖）。
 *
 * 三个预设（动态卡片 / 评论 / 评论区）与截图管线都围绕这组配置工作；
 * 独立成文件让 presets、reflow、padding、capture 之间只共享类型，不互相依赖实现。
 */

/** 多图重排配置：横向滑动图集 → N 列网格（截图前临时重排，截后还原） */
export interface ReflowConfig {
  /** 图集容器选择器（卡片内查找） */
  gallerySel: string
  /** 网格列数，默认 3 */
  columns?: number
  /** 网格间距 px，默认 6 */
  gap?: number
  /** 网格最大宽度 px，默认 540 */
  maxWidth?: number
  /** 是否去掉图片 URL '@' 后的 CDN 压缩参数取原图，默认 true */
  stripParams?: boolean
}

/** 底部留白配置：容器上界 → 头像顶部的距离 */
export interface PaddingConfig {
  /** 动态计算留白；返回 null 时走 paddingRef / bottomPadding 兜底 */
  paddingFn?: (element: HTMLElement) => number | null
  /** 参考元素选择器（头像找不到时按元素高度 × 比例兜底） */
  paddingRef?: string
  /** 参考元素高度比例系数，默认 1 */
  paddingRatio?: number
}

export interface CaptureConfig {
  /** 输出倍率，默认 3 */
  scale?: number
  /** 图片加载等待上限 ms，默认 600 */
  waitMs?: number
  /** SnapDOM 像素级精确布局，默认 true */
  reconcile?: boolean
  /** 底部留白最终兜底值 px，默认 40 */
  bottomPadding?: number
  /** 底部留白下边界 px，默认 10 */
  minBottomPadding?: number
  /** 底部留白上边界 px，默认 40 */
  maxBottomPadding?: number
  /** 多图重排配置；false 关闭 */
  reflow?: ReflowConfig | false
  /** 底部留白配置；false 关闭 */
  padding?: PaddingConfig | false
  /** SnapDOM exclude 选择器（菜单浮层/角标等） */
  exclude?: string[]
}
