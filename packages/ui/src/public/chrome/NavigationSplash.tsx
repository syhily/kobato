import { cn } from '@kobato/ui/lib/cn'
import { BrandLogo } from '@kobato/ui/public/chrome/BrandLogo'
import { useEffect, useRef, useState } from 'react'
import { useNavigation } from 'react-router'

// Global navigation splash — overlays the page on slow route transitions.
// Watches `useNavigation()` only; `useMutation` flows own their own pending UI.
// SSR-safe: `useNavigation()` is `idle` on the server, so we render `null`.

const THRESHOLD_MS = 300
const MIN_VISIBLE_MS = 300
const FADE_OUT_MS = 250
const VEIL_HOLD = 0.15
const VEIL_DURATION_MS = 10_000
const VEIL_FINISH_MS = 250

export function NavigationSplash() {
  const navigation = useNavigation()
  const isPending = navigation.state !== 'idle'

  const [visible, setVisible] = useState(false)
  const [veil, setVeil] = useState(1)
  const [veilMs, setVeilMs] = useState(VEIL_DURATION_MS)

  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shownAt = useRef<number>(0)

  useEffect(() => {
    const clearShow = () => {
      if (showTimer.current) {
        clearTimeout(showTimer.current)
        showTimer.current = null
      }
    }
    const clearHide = () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current)
        hideTimer.current = null
      }
    }
    const clearFade = () => {
      if (fadeTimer.current) {
        clearTimeout(fadeTimer.current)
        fadeTimer.current = null
      }
    }

    if (isPending) {
      clearHide()
      clearFade()

      if (!visible && !showTimer.current) {
        showTimer.current = setTimeout(() => {
          showTimer.current = null
          shownAt.current = performance.now()
          setVeilMs(VEIL_DURATION_MS)
          setVeil(1)
          setVisible(true)
          requestAnimationFrame(() => {
            requestAnimationFrame(() => setVeil(VEIL_HOLD))
          })
        }, THRESHOLD_MS)
      }
    } else {
      clearShow()

      if (visible) {
        const elapsed = performance.now() - shownAt.current
        const wait = Math.max(0, MIN_VISIBLE_MS - elapsed)

        hideTimer.current = setTimeout(() => {
          hideTimer.current = null
          setVeilMs(VEIL_FINISH_MS)
          setVeil(0)
          fadeTimer.current = setTimeout(() => {
            fadeTimer.current = null
            setVisible(false)
          }, VEIL_FINISH_MS)
        }, wait)
      }
    }
  }, [isPending, visible])

  useEffect(
    () => () => {
      if (showTimer.current) {
        clearTimeout(showTimer.current)
      }
      if (hideTimer.current) {
        clearTimeout(hideTimer.current)
      }
      if (fadeTimer.current) {
        clearTimeout(fadeTimer.current)
      }
    },
    [],
  )

  if (!visible) {
    return null
  }

  return (
    <output
      aria-live="polite"
      aria-label="页面加载中"
      className={cn(
        'fixed inset-0 flex items-center justify-center',
        'bg-surface-body',
        'z-(--z-nav-splash)',
        'transition-opacity ease-out',
        'motion-reduce:transition-none',
      )}
      style={{
        opacity: veil === 0 ? 0 : 1,
        transitionDuration: `${FADE_OUT_MS}ms`,
      }}
    >
      <div className="relative aspect-[1237/300] w-[min(80vw,560px)]">
        <BrandLogo alt="" className="h-full w-full select-none" draggable={false} />
        <div
          aria-hidden
          className={cn(
            'absolute inset-0 bg-surface-body',
            'transition-opacity ease-out',
            'motion-reduce:transition-none',
          )}
          style={{
            opacity: veil,
            transitionDuration: `${veilMs}ms`,
          }}
        />
      </div>
    </output>
  )
}
