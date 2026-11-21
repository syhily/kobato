import { useCallback, useRef, useState } from 'react'

export type ActionBannerKind = 'draft' | 'published'

export interface ActionBannerState {
  kind: ActionBannerKind
  slug: string
}

export interface ActionBannerController {
  banner: ActionBannerState | null
  begin: (kind: ActionBannerKind, legs: number) => void
  noteLeg: (slug: string) => void
  cancel: () => void
  dismiss: () => void
}

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
