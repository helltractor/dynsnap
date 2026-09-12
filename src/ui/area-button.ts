/**
 * 评论区顶部「截图评论区」按钮的注入逻辑。
 *
 * 两个宿主形态差异很大，分别处理：
 * - v3（bili-comments）：评论区渲染在 shadow DOM 里，按钮要注入到其头部 renderer 的
 *   shadow root 中，且头部可能晚于评论区出现，需要 spin-query 等待；
 * - v1 / v2：普通 DOM，按钮追加到 tabs 导航。
 * 注入前都查重，配合宿主的重复回调（videoChange / shadow 更新事件）不会注入第二个按钮。
 */
import { select } from '@/core/spin-query'
import type { CommentArea } from '@/components/utils/comment-apis'
import { captureElement } from '../core/capture'
import { getPageId } from '../core/page-id'
import { areaButtonClass, plainConfig } from '../core/presets'

/** 在评论区顶部注入「截图评论区」按钮（v1/v2/v3 评论区均支持） */
export const addAreaButton = async (area: CommentArea) => {
  const { element } = area
  const onClick = () => {
    captureElement(element, `comments_${getPageId()}`, plainConfig)
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
