/**
 * 组件名与 scoped console 的唯一定义点。
 *
 * Toast / 日志前缀 / 组件元数据 displayName 共用同一名称，集中在一处避免
 * 多处字面量在改名时漏改。log.ts 不依赖其它本地模块，可被 core / ui / 入口安全引用。
 */
import { useScopedConsole } from '@/core/utils/log'

/** 组件显示名（Toast 前缀、日志通道、组件元数据共用） */
export const componentName = '动态与评论截图'

/** 组件专属日志通道 */
export const scopedConsole = useScopedConsole(componentName)
