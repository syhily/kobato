import { useCallback, useRef, useState } from 'react'

export type ActionBannerKind = 'draft' | 'published'

export interface ActionBannerState {
  kind: ActionBannerKind
  slug: string
}

export interface ActionBannerController {
  /** Banner currently visible above the editor; null while a save flow is still counting legs or after dismiss. */
  banner: ActionBannerState | null
  /**
   * Arm the countdown for a save flow: the banner appears once `legs`
   * successful legs have been noted. The caller owns the leg count —
   * persist knows whether the body diverged and fires one or two mutations.
   */
  begin: (kind: ActionBannerKind, legs: number) => void
  /** Record one successful leg; shows the banner with `slug` once the countdown reaches zero. */
  noteLeg: (slug: string) => void
  /** Drop an armed countdown without showing the banner (conflict / error paths). */
  cancel: () => void
  /** Hide the visible banner. */
  dismiss: () => void
}

// The post-save preview banner is a two-phase protocol: a save flow arms a
// countdown (`begin`), each successful mutation leg decrements it (`noteLeg`),
// and the banner surfaces only when every leg landed. Conflict / error paths
// `cancel` so a late success cannot flash a stale link. The pending countdown
// lives in a ref — it is mutated from mutation callbacks and must not render.
export function useActionBanner(): ActionBannerController {
  const pendingRef = useRef<{ kind: ActionBannerKind; remaining: number } | null>(null)
  const [banner, setBanner] = useState<ActionBannerState | null>(null)

  const begin = useCallback((kind: ActionBannerKind, legs: number) => {
    pendingRef.current = { kind, remaining: legs }
  }, [])

  const noteLeg = useCallback((slug: string) => {
    const pending = pendingRef.current
    if (pending === null) {
      return
    }
    pending.remaining -= 1
    if (pending.remaining > 0) {
      return
    }
    const kind = pending.kind
    pendingRef.current = null
    setBanner({ kind, slug })
  }, [])

  const cancel = useCallback(() => {
    pendingRef.current = null
  }, [])

  const dismiss = useCallback(() => {
    setBanner(null)
  }, [])

  return { banner, begin, noteLeg, cancel, dismiss }
}
