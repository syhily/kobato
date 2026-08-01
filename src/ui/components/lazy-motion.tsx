import type { MotionConfig, motion } from 'motion/react'

import { Suspense, lazy, type ComponentProps, type ReactNode } from 'react'

// Shared lazy handle on `motion.div` for the popup primitives (dialog,
// dropdown-menu, sheet, popover, select, combobox, alert-dialog). The motion
// runtime only matters while a popup is opening, so it loads asynchronously
// instead of riding the content pages' synchronous bundle. While the chunk
// is in flight — and under SSR, where popup contents are portal-mounted and
// therefore client-only anyway — the plain-div fallback below renders the
// popup fully functional but without the enter animation (the base layer's
// own CSS transitions still apply). That is an accepted degradation, and it
// keeps SSR output and the first hydrated render identical.
const MotionDiv = lazy(() => import('motion/react').then((module) => ({ default: module.motion.div })))

// `children` is narrowed to plain ReactNode: motion.div also accepts
// MotionValue children, but the SSR fallback is a plain div which cannot
// render those — and no popup passes them.
export type LazyMotionDivProps = Omit<ComponentProps<typeof motion.div>, 'children'> & { children?: ReactNode }

export function LazyMotionDiv({ children, ...props }: LazyMotionDivProps) {
  return (
    <Suspense fallback={<div className={props.className}>{children}</div>}>
      <MotionDiv {...props}>{children}</MotionDiv>
    </Suspense>
  )
}

const LazyMotionConfigImpl = lazy(() => import('motion/react').then((module) => ({ default: module.MotionConfig })))

/**
 * `MotionConfig` behind the same lazy boundary: the provider renders no
 * DOM, so the Suspense fallback simply renders the children bare — SSR
 * output and the first hydrated render stay byte-identical either way.
 * Every motion consumer under it is itself behind a lazy boundary on the
 * SAME chunk, so by the time any animated element mounts, the context
 * (transition defaults, reducedMotion) is already in place.
 */
export function LazyMotionConfig({ children, ...props }: ComponentProps<typeof MotionConfig>) {
  return (
    <Suspense fallback={<>{children}</>}>
      <LazyMotionConfigImpl {...props}>{children}</LazyMotionConfigImpl>
    </Suspense>
  )
}
