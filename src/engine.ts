import { DownloadPackage } from '@/core/download'
import { Toast } from '@/core/toast'
import { useScopedConsole } from '@/core/utils/log'
import snapdomModule, { preCache as preCacheModule } from './snapdom'

const snapdom = snapdomModule as unknown as {
  toBlob: (element: HTMLElement, options?: Record<string, unknown>) => Promise<Blob>
}
const preCache = preCacheModule as unknown as (element?: HTMLElement | Document) => Promise<void>

const componentName = '动态与评论截图'
let capturing = false

/**
 * 将任意元素截图为 PNG 并下载
 * @param element 要截图的元素（动态卡片 / 评论 / 评论区）
 * @param id 文件名前缀
 */
export const captureElement = async (element: HTMLElement, id: string) => {
  if (capturing) {
    Toast.info('已有截图进行中, 请稍候', componentName)
    return
  }
  const rect = element.getBoundingClientRect()
  const maxSide = Math.max(rect.width, rect.height)
  if (maxSide > 24000) {
    Toast.error('内容过长, 无法整块截图, 请使用单条评论截图', componentName, 5000)
    return
  }
  capturing = true
  const toast = Toast.info('正在截图...', componentName)
  try {
    await preCache(element)
    const blob = await snapdom.toBlob(element, {
      scale: maxSide > 12000 ? 1 : 2,
      dpr: 1,
      backgroundColor: '#ffffff',
      reconcile: true,
    })
    await DownloadPackage.single(`${id}_${Date.now()}.png`, blob)
    Toast.success('截图已保存', componentName)
  } catch (error) {
    useScopedConsole(componentName).error(error)
    Toast.error(
      `截图失败: ${error instanceof Error ? error.message : String(error)}`,
      componentName,
      5000,
    )
  } finally {
    toast.close()
    capturing = false
  }
}
