/**
 * 组件入口：注册与接线。
 *
 * 领域配置见 core/presets，截图管线见 core/capture，评论区按钮注入见 ui/area-button；
 * 本文件只做三类事——组件元数据、把截图动作挂到 B 站的各类宿主入口（动态菜单 / 评论菜单 /
 * 评论区按钮）、在宿主事件（videoChange / shadow DOM 更新）时保持按钮可用。
 */
import { defineComponentMetadata } from '@/components/define'
import {
  CommentAreaV3,
  CommentItem,
  CommentReplyItem,
} from '@/components/utils/comment-apis'
import type { FeedsCard } from '@/components/feeds/api'
import { videoChange } from '@/core/observer'
import { ShadowRootEvents } from '@/core/shadow-root'
import { columnUrls, feedsUrls, videoUrls } from '@/core/utils/urls'
import { captureElement } from './core/capture'
import { scopedConsole } from './core/log'
import { cardConfig, plainConfig } from './core/presets'
import { addAreaButton } from './ui/area-button'

const entry = async () => {
  scopedConsole.info('组件已启用')
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
            captureElement(item.element, `comment_${item.id}`, plainConfig)
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
