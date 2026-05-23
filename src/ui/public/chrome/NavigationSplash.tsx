import { useEffect, useRef, useState } from 'react'
import { useNavigation } from 'react-router'

import { cn } from '@/ui/lib/cn'
import { BrandLogo } from '@/ui/public/chrome/BrandLogo'

// React Router 7 SSR client navigation fetches the new route's `.data`
// payload over the wire. On slow loaders the old page stays painted
// with no feedback. This component overlays an opaque splash that hides
// the previous page entirely, then eases a logo-covering layer from
// fully opaque to mostly transparent so the logo gradually surfaces —
// the page background underneath stays hidden by the outer mask.
//
// We watch `useNavigation()` only (covers `loading` + `submitting`,
// including back/forward and POST→revalidate). `useFetchers()` is
// intentionally not included — `useMutation` flows (likes, comment
// posts, admin saves) own their own pending UI; a global splash on
// those would be a visual lie about page change.
//
// SSR safety: `useNavigation()` returns `idle` on the server, so we
// render `null` on first paint and on first client render — no
// hydration mismatch.

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
      // A navigation may resume while we're still fading out from the
      // previous one. Cancel the pending teardown and let the existing
      // overlay keep running.
      clearHide()
      clearFade()

      if (!visible && !showTimer.current) {
        showTimer.current = setTimeout(() => {
          showTimer.current = null
          shownAt.current = performance.now()
          // Reset to a fully opaque veil, then start the slow ease
          // toward the cap. Two effect ticks via `requestAnimationFrame`
          // so the transition observes the starting value.
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
          // Snap the veil to fully transparent with a fast finish.
          setVeilMs(VEIL_FINISH_MS)
          setVeil(0)
          fadeTimer.current = setTimeout(() => {
            fadeTimer.current = null
            setVisible(false)
          }, VEIL_FINISH_MS)
        }, wait)
      }
    }

    return () => {
      // The visible / wipe state only changes through the branches
      // above, so we don't want to clear running timers on every
      // re-render. The component-unmount cleanup below catches that.
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
        // Use the page floor so the splash reads as a continuation of the
        // page in both themes instead of an elevated "card" tone — light
        // canvas (#ffffff) is invisible on the public body anyway, but in
        // dark mode --canvas (#26314d) sits 4 L lighter than --surface-body
        // (#1d2842) and pops as a mismatched lighter overlay.
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
