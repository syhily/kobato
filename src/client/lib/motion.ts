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
}
