/**
 * 截图管线：预处理 → 多图重排 → 底部留白 → SnapDOM 渲染 → PNG 导出下载。
 *
 * 渲染层默认值（scale / waitMs / 超时）集中在此；留白默认值归 padding.ts。
 * 模块级 capturing 标志提供全局互斥：重排与留白都会临时改动 DOM，
 * 并发截图会互相污染对方的临时状态，因此整个组件同一时刻只允许一张截图。
 *
 * 失败路径的三条约定（本文件所有改动都围绕它们）：
 * 1. 渲染 / 预缓存 / 导出 / 下载都有超时上限，宿主挂起不会让 capturing 永久为 true；
 * 2. finally 中每个还原步骤独立兜底，任一步抛错都不阻断后续还原与解锁；
 * 3. 所有临时 DOM 改动（媒体播放、懒加载属性、重排、留白）都会被还原。
 */
import { DownloadPackage } from '@/core/download'
import { Toast } from '@/core/toast'
import snapdomModule, { preCache as preCacheModule } from '../snapdom'
import { componentName, scopedConsole } from './log'
import type { CaptureConfig } from './model'
import { applyBottomPadding, calcBottomPadding } from './padding'
import type { PadContext } from './padding'
import { applyReflow } from './reflow'
import type { ReflowContext } from './reflow'

const snapdom = snapdomModule as unknown as {
  toCanvas: (element: HTMLElement, options?: Record<string, unknown>) => Promise<HTMLCanvasElement>
}
const preCache = preCacheModule as unknown as (element?: HTMLElement | Document) => Promise<void>

/** 渲染层默认值（留白相关默认值见 padding.ts） */
const renderDefaults = {
  scale: 3,
  waitMs: 600,
  reconcile: true,
  /** 图片加载等待上限：重排会新建 <img>，固定 sleep 无法覆盖慢图 */
  imageWaitMs: 2000,
  /** 单次宿主调用（渲染 / 导出 / 下载）的超时上限 */
  timeoutMs: 60_000,
}

/** 单边长度上限：超过后整块渲染必然失败 */
const maxSideLimit = 24_000
/** 总像素面积上限：Chromium 画布约 2.68e8，留出余量 */
const maxAreaLimit = 2.4e8
/** 内容过长时的统一提示（守卫与导出失败共用，保证用户总能拿到替代方案） */
const tooLargeMessage = '内容过长, 无法整块截图, 请使用单条评论截图'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * 给宿主调用加超时上限。
 *
 * 注意 Promise.race 只是「不再等待」，并不会取消底层任务：超时后 SnapDOM 仍可能在
 * 后台跑完。相比让 capturing 永久卡死（之后所有截图都提示"已有截图进行中"），
 * 超时解锁是更好的取舍。
 */
const withTimeout = async <T>(task: Promise<T>, ms: number, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      task,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}超时（${ms}ms）`)), ms)
      }),
    ])
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer)
    }
  }
}

/** 暂停卡片内媒体，返回恢复函数（只恢复被本次截图暂停的元素） */
const pauseMedia = (element: HTMLElement) => {
  const paused: HTMLMediaElement[] = []
  element.querySelectorAll<HTMLMediaElement>('video, audio').forEach(media => {
    try {
      if (!media.paused) {
        media.pause()
        paused.push(media)
      }
    } catch (error) {
      // 忽略单个媒体的失败
    }
  })
  return () => {
    paused.forEach(media => {
      try {
        // 自动播放策略可能拒绝恢复；截图已完成，恢复失败不影响产物
        void media.play().catch(() => undefined)
      } catch (error) {
        // 忽略单个媒体的失败
      }
    })
  }
}

/** 触发卡片内懒加载图片（不滚动页面），返回还原函数 */
const triggerLazyImages = (element: HTMLElement) => {
  const restores: (() => void)[] = []
  element.querySelectorAll('img').forEach(img => {
    try {
      const prevLoading = img.getAttribute('loading')
      if (prevLoading !== 'eager') {
        img.loading = 'eager'
        restores.push(() => {
          if (prevLoading === null) {
            img.removeAttribute('loading')
          } else {
            img.setAttribute('loading', prevLoading)
          }
        })
      }
      const lazy = img.getAttribute('data-src') || img.getAttribute('data-original')
      // 两种懒加载写法都要覆盖：src 为空（纯 data-src），以及 src 指向 1px 占位图。
      // 后者若只判 !src 会漏掉，真图永不加载，截图里留下占位图。
      if (lazy && lazy !== img.getAttribute('src')) {
        // src 是站点懒加载器最终也会写入的值，保留不还原，避免截完又变空图
        img.setAttribute('src', lazy)
        // srcset 的优先级高于 src，不清掉的话浏览器仍可能选中占位候选
        if (img.hasAttribute('srcset')) {
          const prevSrcset = img.getAttribute('srcset')
          img.removeAttribute('srcset')
          restores.push(() => img.setAttribute('srcset', prevSrcset ?? ''))
        }
      }
    } catch (error) {
      // 忽略单个图片的失败
    }
  })
  return () => {
    restores.forEach(restore => {
      try {
        restore()
      } catch (error) {
        // 忽略单个图片的失败
      }
    })
  }
}

/** 等待元素内未完成的图片加载结束；超时或全部完成都会 resolve（失败也继续渲染） */
const waitForImages = (element: HTMLElement, timeout: number) => {
  const pending = [...element.querySelectorAll('img')].filter(
    img => !(img.complete && img.naturalWidth > 0),
  )
  if (pending.length === 0) {
    return Promise.resolve()
  }
  return new Promise<void>(resolve => {
    let remaining = pending.length
    let done = false
    const finish = () => {
      if (done) {
        return
      }
      done = true
      clearTimeout(timer)
      pending.forEach(img => {
        img.removeEventListener('load', onSettled)
        img.removeEventListener('error', onSettled)
      })
      resolve()
    }
    const onSettled = () => {
      remaining -= 1
      if (remaining <= 0) {
        finish()
      }
    }
    // 超时兜底：慢图 / 加载失败的图不能让截图一直等下去
    const timer = setTimeout(finish, timeout)
    pending.forEach(img => {
      img.addEventListener('load', onSettled, { once: true })
      img.addEventListener('error', onSettled, { once: true })
    })
  })
}

/** canvas → PNG Blob，带超时（toBlob 回调在极端情况下可能永不触发） */
const canvasToPngBlob = (canvas: HTMLCanvasElement, timeout: number) =>
  withTimeout(
    new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) {
          resolve(blob)
        } else {
          // 走到这里通常就是尺寸超过画布上限，复用同一句指引而非只报导出失败
          reject(new Error(tooLargeMessage))
        }
      }, 'image/png')
    }),
    timeout,
    'PNG 导出',
  )

/** 是否有截图正在进行（全局互斥，见模块注释） */
let capturing = false

/**
 * 截图并下载 PNG：触发懒加载 → 多图重排 → 底部留白 → SnapDOM 渲染 → canvas 导出 PNG。
 *
 * 注意 SnapDOM 的返回值陷阱：toBlob() 默认输出 SVG，toPng() 返回 HTMLImageElement，
 * 必须走 toCanvas() + canvas.toBlob 才能得到真正的 PNG，否则产物是「假 PNG」。
 *
 * @param element 截图目标（动态卡片 / 评论 / 评论区）
 * @param id 文件名前缀
 */
export const captureElement = async (
  element: HTMLElement,
  id: string,
  config: CaptureConfig = {},
) => {
  if (capturing) {
    Toast.info('已有截图进行中, 请稍候', componentName)
    return
  }
  capturing = true
  const timeout = config.timeoutMs ?? renderDefaults.timeoutMs
  let toast: ReturnType<typeof Toast.info> | null = null
  let padCtx: PadContext | null = null
  let reflowCtx: ReflowContext | null = null
  let restoreMedia: (() => void) | null = null
  let restoreLazy: (() => void) | null = null
  try {
    toast = Toast.info('正在截图...', componentName)
    restoreMedia = pauseMedia(element)
    restoreLazy = triggerLazyImages(element)
    if (config.reflow) {
      reflowCtx = applyReflow(element, config.reflow)
      if (reflowCtx) {
        scopedConsole.info(`多图重排：${reflowCtx.count} 张图片已平铺为网格`)
      }
    }
    await waitForImages(element, Math.min(timeout, renderDefaults.imageWaitMs))
    await sleep(config.waitMs ?? renderDefaults.waitMs)
    if (config.padding) {
      const pad = calcBottomPadding(element, config)
      padCtx = applyBottomPadding(element, pad)
    }
    const shotElement = padCtx?.wrap ?? element
    const rect = shotElement.getBoundingClientRect()
    const maxSide = Math.max(rect.width, rect.height)
    const area = rect.width * rect.height
    // 两个上限都要守：单边超长，以及总像素面积超过 Chromium 的画布上限
    // （约 2.68e8）。只看单边的话 20000×20000 会放行，然后在 toBlob 阶段
    // 以「canvas.toBlob 导出失败」告终，丢失这里「请使用单条评论截图」的指引。
    if (maxSide > maxSideLimit || area > maxAreaLimit) {
      throw new Error(tooLargeMessage)
    }
    try {
      // 预缓存只是渲染优化，失败不应让整次截图失败
      await withTimeout(preCache(shotElement), timeout, '图片预缓存')
    } catch (error) {
      scopedConsole.warn('图片预缓存失败，继续渲染', error)
    }
    const canvas = await withTimeout(
      snapdom.toCanvas(shotElement, {
        scale: maxSide > 12000 ? 1 : config.scale ?? renderDefaults.scale,
        dpr: 1,
        backgroundColor: '#ffffff',
        reconcile: config.reconcile ?? renderDefaults.reconcile,
        exclude: config.exclude ?? [],
      }),
      timeout,
      'SnapDOM 渲染',
    )
    const blob = await canvasToPngBlob(canvas, timeout)
    await withTimeout(DownloadPackage.single(`${id}_${Date.now()}.png`, blob), timeout, '文件下载')
    Toast.success('截图已保存', componentName)
  } catch (error) {
    scopedConsole.error(error)
    Toast.error(
      `截图失败: ${error instanceof Error ? error.message : String(error)}`,
      componentName,
      5000,
    )
  } finally {
    // 每个还原步骤独立兜底：任一步抛错都不能阻止解锁 capturing，
    // 否则一次异常就会让组件永久卡在「已有截图进行中」。
    const safely = (label: string, action: () => void) => {
      try {
        action()
      } catch (error) {
        scopedConsole.warn(`${label}失败`, error)
      }
    }
    safely('还原底部留白', () => padCtx?.cleanup())
    safely('还原图集重排', () => reflowCtx?.cleanup())
    safely('还原图片懒加载属性', () => restoreLazy?.())
    safely('恢复媒体播放', () => restoreMedia?.())
    safely('关闭提示', () => toast?.close())
    capturing = false
  }
}
