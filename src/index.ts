import { defineComponentMetadata } from '@/components/define'
import {
  CommentArea,
  CommentAreaV3,
  CommentItem,
  CommentReplyItem,
} from '@/components/utils/comment-apis'
import type { FeedsCard } from '@/components/feeds/api'
import { videoChange } from '@/core/observer'
import { select } from '@/core/spin-query'
import { ShadowRootEvents } from '@/core/shadow-root'
import { columnUrls, feedsUrls, videoUrls } from '@/core/utils/urls'
import { captureElement, CaptureConfig } from '@dynsnap/src/capture'

const areaButtonClass = 'dynsnap-area-trigger'

/** 菜单浮层 / 角标 / 注入按钮：截图时排除，避免截进图里 */
const excludeSelectors = [
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

const avatarSelector =
  '.bili-dyn-item__avatar .b-avatar, .bili-dyn-item__avatar .bili-avatar, .b-avatar, .bili-avatar'

/** 动态卡片：多图重排 + 头像底部留白（原插件核心能力） */
const cardConfig: CaptureConfig = {
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

/** 单条评论 / 回复：无需重排与留白 */
const commentConfig: CaptureConfig = {
  padding: false,
  exclude: excludeSelectors,
}

/** 整个评论区 */
const areaConfig: CaptureConfig = {
  padding: false,
  exclude: excludeSelectors,
}

/** 从当前 URL 提取用于文件名的页面 ID */
const getPageId = () => {
  const url = location.href
  const videoMatch = url.match(/bilibili\.com\/video\/(BV[\w]+|av\d+)/i)
  if (videoMatch) {
    return videoMatch[1]
  }
  const opusMatch = url.match(/bilibili\.com\/opus\/(\d+)/)
  if (opusMatch) {
    return `opus_${opusMatch[1]}`
  }
  const columnMatch = url.match(/bilibili\.com\/read\/cv(\d+)/)
  if (columnMatch) {
    return `cv${columnMatch[1]}`
  }
  const detailMatch = url.match(/t\.bilibili\.com\/(\d+)/)
  if (detailMatch) {
    return detailMatch[1]
  }
  return String(Date.now())
}

/** 在评论区顶部注入「截图评论区」按钮（v1/v2/v3 评论区均支持） */
const addAreaButton = async (area: CommentArea) => {
  const { element } = area
  const onClick = () => {
    captureElement(element, `comments_${getPageId()}`, areaConfig)
  }
  if (element.tagName.toLowerCase() === 'bili-comments') {
    // v3 评论区渲染在 shadow DOM 中, 按钮需注入到其头部
    const headerRenderer = await select(() => {
      const shadowRoot = element.shadowRoot?.querySelector(
        'bili-comments-header-renderer',
      )?.shadowRoot
      return shadowRoot && shadowRoot.querySelectorAll('bili-text-button').length > 0
        ? shadowRoot
        : null
    })
    if (!headerRenderer || headerRenderer.querySelector(`.${areaButtonClass}`)) {
      return
    }
    const button = document.createElement('bili-text-button')
    button.className = areaButtonClass
    button.textContent = '截图评论区'
    button.addEventListener('click', onClick)
    const buttons = headerRenderer.querySelectorAll('bili-text-button')
    buttons[buttons.length - 1]?.after(button)
    return
  }
  // v1 / v2 评论区
  if (element.querySelector(`.${areaButtonClass}`)) {
    return
  }
  const button = document.createElement('div')
  button.className = `${areaButtonClass} bili-tabs__nav__item`
  button.textContent = '截图评论区'
  button.addEventListener('click', onClick)
  const navContainer = element.querySelector('.bili-tabs__nav__items')
  if (navContainer) {
    navContainer.appendChild(button)
  } else {
    element.insertBefore(button, element.firstChild)
  }
}

const entry = async () => {
  // 动态卡片菜单: 截图动态（多图重排 + 底部留白）
  const { forEachFeedsCard, addMenuItem: addFeedsMenuItem } = await import('@/components/feeds/api')
  forEachFeedsCard({
    added: (card: FeedsCard) => {
      addFeedsMenuItem(card, {
        className: 'dynsnap-card',
        text: '截图动态',
        action: () => {
          captureElement(card.element, `dynamic_${card.id}`, cardConfig)
        },
      })
    },
  })

  // 评论菜单: 截图评论（含回复）
  const {
    forEachCommentItem,
    forEachCommentArea,
    addMenuItem: addCommentMenuItem,
    commentAreaManager,
  } = await import('@/components/utils/comment-apis')
  const addCommentScreenshotItem = (comment: CommentItem) => {
    const processItems = (items: CommentReplyItem[]) => {
      items.forEach(item => {
        addCommentMenuItem(item, {
          className: 'dynsnap-comment',
          text: '截图评论',
          action: () => {
            captureElement(item.element, `comment_${item.id}`, commentConfig)
          },
        })
      })
    }
    // CommentItem 继承自 CommentReplyItem，但宿主类对 addEventListener 的收窄签名
    // 在 strictFunctionTypes 下不可逆变赋值，此处显式上转型。
    processItems([comment, ...comment.replies] as CommentReplyItem[])
    comment.addEventListener('repliesUpdate', e => processItems(e.detail))
  }
  forEachCommentItem({
    added: addCommentScreenshotItem,
  })

  // 评论区顶部按钮: 截图当前评论区
  const refreshAreaButtons = () => {
    commentAreaManager.commentAreas.forEach(area => {
      addAreaButton(area)
    })
  }
  forEachCommentArea(area => {
    addAreaButton(area)
    if (area instanceof CommentAreaV3) {
      area.commentAreaEntry.addEventListener(
        ShadowRootEvents.Updated,
        lodash.debounce(() => addAreaButton(area), 300),
      )
    }
  })
  videoChange(refreshAreaButtons)
}

export const component = defineComponentMetadata({
  name: 'dynsnap',
  displayName: '动态与评论截图',
  author: {
    name: 'helltractor',
    link: 'https://github.com/helltractor',
  },
  entry,
  urlInclude: [...videoUrls, ...columnUrls, ...feedsUrls],
  tags: [componentsTags.feeds, componentsTags.utils],
})
