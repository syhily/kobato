import type { AnimatePresence, MotionConfig, motion } from 'motion/react'

import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { createElement, lazy, Suspense, type ComponentProps, type CSSProperties, type ReactNode } from 'react'

// Shared lazy handles on the `motion/react` runtime. The motion code only
// matters while an animation runs, so it loads asynchronously instead of
// riding the content pages' synchronous bundle: every handle below is a
// `lazy()` on the SAME dynamic import, which Vite serves as one shared
// chunk fetched the first time any animated element actually mounts.
//
// While the chunk is in flight — and under SSR, where the lazy boundary
// never resolves — each element renders a static fallback: the same DOM
// tag with every DOM prop (className, style, onClick, aria-*, inert,
// tabIndex, ref) forwarded verbatim and only the animation-only props
// stripped. The fallback stays fully functional; the accepted degradation
// is the missing enter animation (the base layer's own CSS transitions
// still apply). That keeps SSR output and the first hydrated render
// identical.
const MotionDiv = lazy(() => import('motion/react').then((module) => ({ default: module.motion.div })))
const MotionButton = lazy(() => import('motion/react').then((module) => ({ default: module.motion.button })))
const MotionSpan = lazy(() => import('motion/react').then((module) => ({ default: module.motion.span })))
const MotionH1 = lazy(() => import('motion/react').then((module) => ({ default: module.motion.h1 })))
const MotionP = lazy(() => import('motion/react').then((module) => ({ default: module.motion.p })))
const AnimatePresenceImpl = lazy(() => import('motion/react').then((module) => ({ default: module.AnimatePresence })))

// Props that drive the animation runtime only. They are stripped from the
// static fallback (React would warn about unknown DOM attributes); every
// other prop is DOM-safe and forwards.
const ANIMATION_ONLY_PROPS = new Set([
  'initial',
  'animate',
  'exit',
  'variants',
  'transition',
  'whileHover',
  'whileTap',
  'whileFocus',
  'whileDrag',
  'whileInView',
  'drag',
  'dragConstraints',
  'dragControls',
  'dragElastic',
  'dragMomentum',
  'dragSnapToOrigin',
  'dragTransition',
  'layout',
  'layoutId',
  'onAnimationStart',
  'onAnimationComplete',
  'fallbackStyle',
])

type FallbackTag = 'div' | 'button' | 'span' | 'h1' | 'p'

// `props` is the full motion-element prop bag; at runtime it is a plain
// object, so narrowing it to a string map to partition DOM props from
// animation props is shape-safe.
function staticFallback(tag: FallbackTag, props: object, children: ReactNode): ReactNode {
  const source = unsafeCast<Record<string, unknown>>(props)
  const domProps: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    if (!ANIMATION_ONLY_PROPS.has(key)) {
      domProps[key] = value
    }
  }
  const fallbackStyle = source.fallbackStyle
  if (fallbackStyle !== undefined) {
    const style = source.style
    domProps.style = {
      ...(typeof style === 'object' && style !== null ? unsafeCast<CSSProperties>(style) : {}),
      ...unsafeCast<CSSProperties>(fallbackStyle),
    }
  }
  return createElement(tag, domProps, children)
}

// `children` is narrowed to plain ReactNode: motion elements also accept
// MotionValue children, but the static fallback is a plain element which
// cannot render those — and no consumer passes them.
type LazyMotionElementProps<Props> = Omit<Props, 'children'> & {
  children?: ReactNode
  /** Extra styles applied ONLY to the static fallback — for positional
   *  state that must hold before the motion chunk arrives (e.g. the ToC
   *  drawer's off-screen resting transform). Once the chunk resolves the
   *  motion element takes over and this is ignored. */
  fallbackStyle?: CSSProperties
}

export type LazyMotionDivProps = LazyMotionElementProps<ComponentProps<typeof motion.div>>
export type LazyMotionButtonProps = LazyMotionElementProps<ComponentProps<typeof motion.button>>
export type LazyMotionSpanProps = LazyMotionElementProps<ComponentProps<typeof motion.span>>
export type LazyMotionH1Props = LazyMotionElementProps<ComponentProps<typeof motion.h1>>
export type LazyMotionPProps = LazyMotionElementProps<ComponentProps<typeof motion.p>>

export function LazyMotionDiv({ children, fallbackStyle, ...props }: LazyMotionDivProps) {
  return (
    <Suspense fallback={staticFallback('div', { ...props, fallbackStyle }, children)}>
      <MotionDiv {...props}>{children}</MotionDiv>
    </Suspense>
  )
}

export function LazyMotionButton({ children, fallbackStyle, ...props }: LazyMotionButtonProps) {
  return (
    <Suspense fallback={staticFallback('button', { ...props, fallbackStyle }, children)}>
      <MotionButton {...props}>{children}</MotionButton>
    </Suspense>
  )
}

export function LazyMotionSpan({ children, fallbackStyle, ...props }: LazyMotionSpanProps) {
  return (
    <Suspense fallback={staticFallback('span', { ...props, fallbackStyle }, children)}>
      <MotionSpan {...props}>{children}</MotionSpan>
    </Suspense>
  )
}

export function LazyMotionH1({ children, fallbackStyle, ...props }: LazyMotionH1Props) {
  return (
    <Suspense fallback={staticFallback('h1', { ...props, fallbackStyle }, children)}>
      <MotionH1 {...props}>{children}</MotionH1>
    </Suspense>
  )
}

export function LazyMotionP({ children, fallbackStyle, ...props }: LazyMotionPProps) {
  return (
    <Suspense fallback={staticFallback('p', { ...props, fallbackStyle }, children)}>
      <MotionP {...props}>{children}</MotionP>
    </Suspense>
  )
}

/**
 * `AnimatePresence` behind the same lazy boundary: the fallback renders
 * the children bare, so content appears immediately and only exit
 * animations wait for the motion chunk.
 */
export function LazyAnimatePresence({ children, ...props }: ComponentProps<typeof AnimatePresence>) {
  return (
    <Suspense fallback={<>{children}</>}>
      <AnimatePresenceImpl {...props}>{children}</AnimatePresenceImpl>
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
