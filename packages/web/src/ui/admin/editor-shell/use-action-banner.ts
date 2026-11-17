import { useCallback, useRef, useState } from 'react'

export type ActionBannerKind = 'draft' | 'published'

export interface ActionBannerState {
  kind: ActionBannerKind
  slug: string
}

export interface ActionBannerController {
  /** Banner visible above the editor; null while a save flow counts legs or after dismiss. */
  banner: ActionBannerState | null
  /** Arm the countdown for a save flow — the banner appears once `legs` successful legs are noted; the caller owns the leg count. */
  begin: (kind: ActionBannerKind, legs: number) => void
  /** Record one successful leg; shows the banner with `slug` once the countdown reaches zero. */
  noteLeg: (slug: string) => void
  /** Drop an armed countdown without showing the banner (conflict / error paths). */
  cancel: () => void
  /** Hide the visible banner. */
  dismiss: () => void
}

// Two-phase post-save banner protocol: `begin` arms a countdown, `noteLeg`
// decrements per successful mutation leg; the banner surfaces only when every
// leg landed — conflict/error paths `cancel` so a late success can't flash a stale link.
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
