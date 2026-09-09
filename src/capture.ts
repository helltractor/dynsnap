import { DownloadPackage } from '@/core/download'
import { Toast } from '@/core/toast'
import { useScopedConsole } from '@/core/utils/log'
import snapdomModule, { preCache as preCacheModule } from './snapdom'

const componentName = '动态与评论截图'
const scopedConsole = useScopedConsole(componentName)

const snapdom = snapdomModule as unknown as {
  toCanvas: (element: HTMLElement, options?: Record<string, unknown>) => Promise<HTMLCanvasElement>
}
const preCache = preCacheModule as unknown as (element?: HTMLElement | Document) => Promise<void>

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

const defaults = {
  scale: 3,
  waitMs: 600,
  reconcile: true,
  bottomPadding: 40,
  minBottomPadding: 10,
  maxBottomPadding: 40,
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** 暂停卡片内媒体，避免截到播放中的画面 / 声音继续播放 */
const pauseMedia = (element: HTMLElement) => {
  element.querySelectorAll('video, audio').forEach(media => {
    try {
      media.pause()
    } catch (error) {
      // 忽略单个媒体的失败
    }
  })
}

/** 触发卡片内懒加载图片（不滚动页面） */
const triggerLazyImages = (element: HTMLElement) => {
  element.querySelectorAll('img').forEach(img => {
    try {
      img.loading = 'eager'
      const lazy = img.getAttribute('data-src') || img.getAttribute('data-original')
      if (lazy && !img.getAttribute('src')) {
        img.setAttribute('src', lazy)
      }
    } catch (error) {
      // 忽略单个图片的失败
    }
  })
}

/**
 * 多图重排：横向滑动图集截图时只露出首图，其余被裁掉；
 * 截图前把图集重排为 N 列网格矩阵（所有图片平铺），截后完整还原。
 */
const applyReflow = (element: HTMLElement, config: ReflowConfig) => {
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
    grid.className = 'dynshot-reflow-grid'
    grid.style.cssText =
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
      grid.appendChild(cell)
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

/** 底部留白：paddingFn > paddingRef × paddingRatio > bottomPadding，结果收敛到 [min, max] */
const calcBottomPadding = (element: HTMLElement, config: CaptureConfig) => {
  const min = config.minBottomPadding ?? defaults.minBottomPadding
  const max = config.maxBottomPadding ?? defaults.maxBottomPadding
  const clamp = (value: number | null | undefined) => {
    if (value === null || value === undefined) {
      return null
    }
    const num = Math.round(Number(value))
    if (!Number.isFinite(num) || num <= 0) {
      return min
    }
    return Math.max(min, Math.min(num, max))
  }
  const padding = config.padding
  if (padding) {
    if (typeof padding.paddingFn === 'function') {
      let value: number | null = null
      try {
        value = padding.paddingFn(element)
      } catch (error) {
        value = null
      }
      const result = clamp(value)
      if (result !== null) {
        return result
      }
    }
    if (padding.paddingRef) {
      const refEl = element.querySelector(padding.paddingRef) as HTMLElement | null
      if (refEl && refEl.offsetHeight > 0) {
        const marginBottom = parseFloat(getComputedStyle(refEl).marginBottom) || 0
        const ratio = padding.paddingRatio || 1
        const result = clamp((refEl.offsetHeight + marginBottom) * ratio)
        if (result !== null) {
          return result
        }
      }
    }
  }
  return config.bottomPadding ?? defaults.bottomPadding
}

/** 临时给元素加 padding-bottom，读取计算值确认生效；被 !important 覆盖时降级为包装器 */
const applyPadViaWrapper = (element: HTMLElement, pad: number) => {
  const computed = getComputedStyle(element)
  const wrap = document.createElement('div')
  wrap.setAttribute('data-dynshot-pad-wrap', '')
  wrap.style.cssText =
    'box-sizing:border-box;' +
    `margin:${computed.marginTop} ${computed.marginRight} ${computed.marginBottom} ${computed.marginLeft};` +
    `width:${Math.max(1, element.offsetWidth)}px;` +
    `padding-bottom:${pad}px;` +
    'background:#ffffff;'
  const saved = {
    margin: element.style.margin,
    marginTop: element.style.marginTop,
    marginRight: element.style.marginRight,
    marginBottom: element.style.marginBottom,
    marginLeft: element.style.marginLeft,
  }
  if (!element.parentNode) {
    throw new Error('元素不在文档中，无法应用包装器留白')
  }
  element.style.margin = '0'
  element.parentNode.insertBefore(wrap, element)
  wrap.appendChild(element)
  return {
    wrap,
    cleanup: () => {
      element.style.margin = saved.margin
      element.style.marginTop = saved.marginTop
      element.style.marginRight = saved.marginRight
      element.style.marginBottom = saved.marginBottom
      element.style.marginLeft = saved.marginLeft
      if (wrap.parentNode) {
        wrap.parentNode.insertBefore(element, wrap)
        wrap.remove()
      }
    },
  }
}

const applyBottomPadding = (element: HTMLElement, pad: number) => {
  if (!(pad > 0)) {
    return null
  }
  const original = element.style.paddingBottom
  element.style.paddingBottom = `${pad}px`
  const actual = parseFloat(getComputedStyle(element).paddingBottom) || 0
  if (Math.abs(actual - pad) < 1) {
    return {
      wrap: null as HTMLElement | null,
      cleanup: () => {
        element.style.paddingBottom = original
      },
    }
  }
  element.style.paddingBottom = original
  try {
    const wrapped = applyPadViaWrapper(element, pad)
    return { wrap: wrapped.wrap, cleanup: wrapped.cleanup }
  } catch (error) {
    scopedConsole.warn('包装器留白失败，跳过底部留白', error)
    return null
  }
}

let capturing = false

/**
 * 截图并下载 PNG：触发懒加载 → 多图重排 → 底部留白 → SnapDOM 渲染 → canvas 导出 PNG
 * @param element 截图目标（动态卡片 / 评论 / 评论区）
 * @param id 文件名前缀
 */
export const captureElement = async (element: HTMLElement, id: string, config: CaptureConfig = {}) => {
  if (capturing) {
    Toast.info('已有截图进行中, 请稍候', componentName)
    return
  }
  capturing = true
  const toast = Toast.info('正在截图...', componentName)
  let padCtx: { wrap: HTMLElement | null; cleanup: () => void } | null = null
  let reflowCtx: { count: number; cleanup: () => void } | null = null
  try {
    pauseMedia(element)
    triggerLazyImages(element)
    if (config.reflow) {
      reflowCtx = applyReflow(element, config.reflow)
      if (reflowCtx) {
        scopedConsole.info(`多图重排：${reflowCtx.count} 张图片已平铺为网格`)
      }
    }
    await sleep(config.waitMs ?? defaults.waitMs)
    if (config.padding) {
      const pad = calcBottomPadding(element, config)
      padCtx = applyBottomPadding(element, pad)
    }
    const shotElement = padCtx?.wrap ?? element
    const rect = shotElement.getBoundingClientRect()
    const maxSide = Math.max(rect.width, rect.height)
    if (maxSide > 24000) {
      throw new Error('内容过长, 无法整块截图, 请使用单条评论截图')
    }
    await preCache(shotElement)
    // 注意: snapdom.toBlob() 默认输出 SVG, toPng() 返回 HTMLImageElement;
    // 必须走 toCanvas() + canvas.toBlob 才能得到真正的 PNG。
    const canvas = await snapdom.toCanvas(shotElement, {
      scale: maxSide > 12000 ? 1 : config.scale ?? defaults.scale,
      dpr: 1,
      backgroundColor: '#ffffff',
      reconcile: config.reconcile ?? defaults.reconcile,
      exclude: config.exclude ?? [],
    })
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) {
      throw new Error('canvas.toBlob 导出失败')
    }
    await DownloadPackage.single(`${id}_${Date.now()}.png`, blob)
    Toast.success('截图已保存', componentName)
  } catch (error) {
    scopedConsole.error(error)
    Toast.error(
      `截图失败: ${error instanceof Error ? error.message : String(error)}`,
      componentName,
      5000,
    )
  } finally {
    padCtx?.cleanup()
    reflowCtx?.cleanup()
    toast.close()
    capturing = false
  }
}
