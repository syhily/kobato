export { motion, AnimatePresence, useAnimation, useMotionValue, useTransform, useSpring } from 'motion/react'

export const transitions = {
  /** 通用 spring，手感紧实 */
  spring: { type: 'spring' as const, stiffness: 300, damping: 30 },
  /** 柔和 spring，适合大面板 */
  gentle: { type: 'spring' as const, stiffness: 200, damping: 25 },
  /** 抽屉滑入 */
  drawer: { type: 'spring' as const, stiffness: 400, damping: 35 },
  /** 淡入淡出 */
  fade: { duration: 0.3, ease: 'easeOut' as const },
  /** 详情页 fade-up（匹配原 CSS cubic-bezier） */
  detailFade: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  /** 子元素 stagger */
  stagger: { staggerChildren: 0.05 },
  /** 慢速循环 */
  slowLoop: { repeat: Infinity, duration: 20, ease: 'easeInOut' as const },
  /** 脉冲循环 */
  pulseLoop: { repeat: Infinity, duration: 6, ease: 'easeInOut' as const, repeatType: 'reverse' as const },
  /** 弹窗内容 spring — 与 backdrop fade 同步 (0.35s) */
  popup: { type: 'spring' as const, duration: 0.35, bounce: 0.15 },
  /** 弹窗 backdrop 淡入 — 与内容 spring 同步 */
  popupFade: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  /** Dialog 内容 spring — 与 CSS transition 同步 (0.3s) */
  dialog: { type: 'spring' as const, duration: 0.3, bounce: 0.15 },
  /** 菜单 / 下拉 spring — 与 CSS transition 同步 (0.25s) */
  menu: { type: 'spring' as const, duration: 0.25, bounce: 0.15 },
}
