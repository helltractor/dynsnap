/**
 * 多图重排：横向滑动图集截图时只露出首图，其余被裁掉。
 *
 * 截图前把图集重排为 N 列网格矩阵（所有图片平铺），截后完整还原。
 * 独立成模块使这段 DOM 操作可以在截图管线之外单独测试。
 */
import { scopedConsole } from './log'
import type { ReflowConfig } from './model'

export interface ReflowContext {
  /** 平铺进网格的图片数量（仅用于日志） */
  count: number
  /** 移除临时网格并还原图集原 display */
  cleanup: () => void
}

/** 触发多图重排，返回 null 表示无图集 / 单图 / 重排失败（均已安全跳过） */
export const applyReflow = (element: HTMLElement, config: ReflowConfig): ReflowContext | null => {
  let gallery: HTMLElement | null = null
  let grid: HTMLElement | null = null
  let prevDisplay = ''
  try {
    gallery = element.querySelector(config.gallerySel) as HTMLElement | null
    if (!gallery || !gallery.parentNode) {
      return null
    }
    const urls = [...gallery.querySelectorAll('img')]
      .map(img => {
        const src = img.currentSrc || img.src || ''
        return config.stripParams === false ? src : src.split('@')[0]
      })
      .filter(Boolean)
    if (urls.length < 2) {
      return null
    }
    grid = document.createElement('div')
    const gridEl = grid
    gridEl.className = 'dynsnap-reflow-grid'
    gridEl.style.cssText =
      'display:grid;' +
      `grid-template-columns:repeat(${config.columns || 3},1fr);` +
      `gap:${config.gap || 6}px;` +
      `width:100%;max-width:${config.maxWidth || 540}px;` +
      'margin-top:10px;'
    urls.forEach(url => {
      const cell = document.createElement('div')
      cell.style.cssText = 'aspect-ratio:1/1;overflow:hidden;border-radius:6px;background:#f1f2f3;'
      const img = document.createElement('img')
      img.src = url
      img.loading = 'eager'
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;'
      cell.appendChild(img)
      gridEl.appendChild(cell)
    })
    prevDisplay = gallery.style.display
    gallery.style.display = 'none'
    gallery.parentNode.insertBefore(grid, gallery.nextSibling)
    return {
      count: urls.length,
      cleanup: () => {
        grid?.remove()
        if (gallery) {
          gallery.style.display = prevDisplay || ''
        }
      },
    }
  } catch (error) {
    scopedConsole.warn('多图重排失败，已跳过', error)
    grid?.remove()
    if (gallery) {
      gallery.style.display = prevDisplay || ''
    }
    return null
  }
}
