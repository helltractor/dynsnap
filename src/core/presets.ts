/**
 * B 站页面的截图预设：决定某类目标「截什么、排除什么」。
 *
 * 预设只表达策略（重排 / 留白 / 排除项），触发点（动态菜单 / 评论菜单 / 评论区按钮）
 * 在入口与 ui 层引用它们；excludeSelectors 同时是注入按钮的自隐藏清单——
 * 按钮带 dynsnap 类名，靠这份清单把自己从截图里排除。
 */
import type { CaptureConfig } from './model'

/** 评论区顶部按钮 / 注入菜单按钮的类名（加入 exclude 后按钮不会截进图里） */
export const areaButtonClass = 'dynsnap-area-trigger'

/** 菜单浮层 / 角标 / 注入按钮：截图时排除，避免截进图里 */
export const excludeSelectors = [
  '.more-panel',
  '.bili-dyn-more__menu',
  '.opus-more__menu',
  '.bili-dyn-item__more',
  '.opus-more',
  '.bili-cascader',
  '.bili-dyn-card-video__cover__mask',
  '.dyn-video-preview',
  '.dynsnap-card',
  '.dynsnap-comment',
  `.${areaButtonClass}`,
]

/** 动态卡片头像选择器（paddingFn 定位留白起点用） */
export const avatarSelector =
  '.bili-dyn-item__avatar .b-avatar, .bili-dyn-item__avatar .bili-avatar, .b-avatar, .bili-avatar'

/** 动态卡片：多图重排 + 头像底部留白（原插件核心能力） */
export const cardConfig: CaptureConfig = {
  reflow: {
    gallerySel: '.bili-dyn-gallery',
    columns: 3,
    gap: 6,
    maxWidth: 540,
    stripParams: true,
  },
  padding: {
    paddingFn: element => {
      const avatar = element.querySelector(avatarSelector) as HTMLElement | null
      if (!avatar || avatar.offsetHeight === 0) {
        return null
      }
      return Math.round(
        avatar.getBoundingClientRect().top - element.getBoundingClientRect().top,
      )
    },
    paddingRef:
      '.bili-dyn-item__header, .bili-dyn-item__avatar, [class*="opus-card"] [class*="header"], [class*="opus-detail"] [class*="header"]',
    paddingRatio: 0.6,
  },
  exclude: excludeSelectors,
}

/** 评论与评论区共用：无重排、无留白，仅排除浮层（两种目标结构差异大，留白算法不通用） */
export const plainConfig: CaptureConfig = {
  padding: false,
  exclude: excludeSelectors,
}
