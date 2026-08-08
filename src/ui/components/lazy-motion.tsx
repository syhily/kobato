import type { AnimatePresence, MotionConfig, motion } from 'motion/react'

import { createElement, lazy, Suspense, type ComponentProps, type CSSProperties, type ReactNode } from 'react'

import { unsafeCast } from '@/shared/utils/unsafe-cast'

// Shared lazy handles on the `motion/react` runtime — one dynamic import, one
// shared chunk. Until it resolves (incl. SSR) elements render a static DOM
// fallback: DOM props forwarded, animation-only props stripped, enter animation lost.
const MotionDiv = lazy(() => import('motion/react').then((module) => ({ default: module.motion.div })))
const MotionButton = lazy(() => import('motion/react').then((module) => ({ default: module.motion.button })))
const MotionSpan = lazy(() => import('motion/react').then((module) => ({ default: module.motion.span })))
const MotionH1 = lazy(() => import('motion/react').then((module) => ({ default: module.motion.h1 })))
const MotionP = lazy(() => import('motion/react').then((module) => ({ default: module.motion.p })))
const AnimatePresenceImpl = lazy(() => import('motion/react').then((module) => ({ default: module.AnimatePresence })))

// Animation-only props, stripped from the static fallback (React warns on unknown DOM attributes).
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

// `props` is a plain object at runtime, so the string-map narrowing is shape-safe.
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

// Static fallback cannot render MotionValue children; no consumer passes them.
type LazyMotionElementProps<Props> = Omit<Props, 'children'> & {
  children?: ReactNode
  /** Extra styles applied ONLY to the static fallback (e.g. the ToC drawer's
   *  off-screen resting transform); ignored once the motion element takes over. */
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
 * `AnimatePresence` behind the same lazy boundary; only exit animations wait
 * for the motion chunk.
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
 * `MotionConfig` behind the same lazy boundary — no DOM, so the fallback
 * renders children bare.
 */
export function LazyMotionConfig({ children, ...props }: ComponentProps<typeof MotionConfig>) {
  return (
    <Suspense fallback={<>{children}</>}>
      <LazyMotionConfigImpl {...props}>{children}</LazyMotionConfigImpl>
    </Suspense>
  )
}
