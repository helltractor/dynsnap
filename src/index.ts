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
import { captureElement } from '@dynshot/src/engine'

const areaButtonClass = 'dynshot-area-trigger'

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
    captureElement(element, `comments_${getPageId()}`)
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
  // 动态卡片菜单: 截图动态（保留原 dynshot 核心功能, 仅 B 站）
  const { forEachFeedsCard, addMenuItem: addFeedsMenuItem } = await import('@/components/feeds/api')
  forEachFeedsCard({
    added: (card: FeedsCard) => {
      addFeedsMenuItem(card, {
        className: 'dynshot-card',
        text: '截图动态',
        action: () => {
          captureElement(card.element, `dynamic_${card.id}`)
        },
      })
    },
  })

  // 评论菜单: 截图评论（覆盖视频 / 专栏 / 动态详情等页面的评论区）
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
          className: 'dynshot-comment',
          text: '截图评论',
          action: () => {
            captureElement(item.element, `comment_${item.id}`)
          },
        })
      })
    }
    processItems([comment, ...comment.replies])
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
  name: 'dynshot',
  displayName: '动态与评论截图',
  author: {
    name: 'helltractor',
    link: 'https://github.com/helltractor',
  },
  entry,
  urlInclude: [...videoUrls, ...columnUrls, ...feedsUrls],
  tags: [componentsTags.feeds, componentsTags.utils],
})
