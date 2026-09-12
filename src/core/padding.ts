/**
 * 底部留白：截图底部附加空白，避免内容"顶天立地"。
 *
 * 计算优先级 paddingFn > paddingRef × paddingRatio > bottomPadding，结果收敛到 [min, max]。
 * 应用时优先走 inline padding-bottom；被 CSS !important 覆盖时降级为包装器方案。
 */
import { scopedConsole } from './log'
import type { CaptureConfig, PaddingConfig } from './model'

/** 留白兜底默认值（与 CaptureConfig 各字段的默认值一致） */
const paddingDefaults = {
  bottomPadding: 40,
  minBottomPadding: 10,
  maxBottomPadding: 40,
}

/** 留白上下文：shotElement 为实际送去渲染的元素（包装器方案下是外层 wrap） */
export interface PadContext {
  wrap: HTMLElement | null
  cleanup: () => void
}

/** 按优先级计算底部留白像素值，结果恒为正且收敛到 [min, max] */
export const calcBottomPadding = (element: HTMLElement, config: CaptureConfig) => {
  const min = config.minBottomPadding ?? paddingDefaults.minBottomPadding
  const max = config.maxBottomPadding ?? paddingDefaults.maxBottomPadding
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
  const padding: PaddingConfig | false | undefined = config.padding
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
  return config.bottomPadding ?? paddingDefaults.bottomPadding
}

/**
 * 临时给元素加 padding-bottom，读取计算值确认生效。
 *
 * inline padding 可能被站点的 !important 规则覆盖，此时改用「白底包装器」：
 * 把元素临时搬进一个带 padding-bottom 的 div，截后原样搬回。
 */
const applyPadViaWrapper = (element: HTMLElement, pad: number) => {
  const computed = getComputedStyle(element)
  const wrap = document.createElement('div')
  wrap.setAttribute('data-dynsnap-pad-wrap', '')
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

/** 应用底部留白，优先 inline padding，被覆盖时自动降级为包装器；pad <= 0 时不动 */
export const applyBottomPadding = (element: HTMLElement, pad: number): PadContext | null => {
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
