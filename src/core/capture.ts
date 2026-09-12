/**
 * 截图管线：预处理 → 多图重排 → 底部留白 → SnapDOM 渲染 → PNG 导出下载。
 *
 * 渲染层默认值（scale / waitMs / reconcile）集中在此；留白默认值归 padding.ts。
 * 模块级 capturing 标志提供全局互斥：重排与留白都会临时改动 DOM，
 * 并发截图会互相污染对方的临时状态，因此整个组件同一时刻只允许一张截图。
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
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** 暂停卡片内媒体，避免截到播放中的画面 / 声音继续播放 */
const pauseMedia = (element: HTMLElement) => {
  element.querySelectorAll<HTMLMediaElement>('video, audio').forEach(media => {
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
export const captureElement = async (element: HTMLElement, id: string, config: CaptureConfig = {}) => {
  if (capturing) {
    Toast.info('已有截图进行中, 请稍候', componentName)
    return
  }
  capturing = true
  const toast = Toast.info('正在截图...', componentName)
  let padCtx: PadContext | null = null
  let reflowCtx: ReflowContext | null = null
  try {
    pauseMedia(element)
    triggerLazyImages(element)
    if (config.reflow) {
      reflowCtx = applyReflow(element, config.reflow)
      if (reflowCtx) {
        scopedConsole.info(`多图重排：${reflowCtx.count} 张图片已平铺为网格`)
      }
    }
    await sleep(config.waitMs ?? renderDefaults.waitMs)
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
    const canvas = await snapdom.toCanvas(shotElement, {
      scale: maxSide > 12000 ? 1 : config.scale ?? renderDefaults.scale,
      dpr: 1,
      backgroundColor: '#ffffff',
      reconcile: config.reconcile ?? renderDefaults.reconcile,
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
