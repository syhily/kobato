import { useCallback, useEffect, useRef, useState } from 'react'

import { useSyncScroll } from '@/client/hooks/use-sync-scroll'
import { useAdminChromeFocus, useAdminScrollTopLift } from '@/ui/admin/shell/AdminShell'

export function useEditorShellLayout() {
  const [previewOpen, setPreviewOpenState] = useState(false)
  useAdminChromeFocus(previewOpen)
  // Lift the shared ScrollTop FAB throughout the editor session so it
  // clears the bottom-right publish FAB (`FloatingPublishButton`)
  // whenever the operator scrolls past the inline toolbar.
  useAdminScrollTopLift(true)

  const editorScrollRef = useRef<HTMLDivElement>(null)
  const previewScrollRef = useRef<HTMLDivElement>(null)
  useSyncScroll({ editorRef: editorScrollRef, previewRef: previewScrollRef, enabled: previewOpen })

  // `isLg` + `metaOpen` are deliberately driven from a single inline
  // `matchMedia` listener instead of the shared `useMediaQuery`
  // hook. The reason: when the viewport crosses OUT of `lg` we MUST
  // collapse the meta panel in the same render that flips `isLg` to
  // `false`, otherwise the Sheet (about to take over from the inline
  // aside) renders one frame with `open=true`, attaches its scrim
  // backdrop, and then closes on the next effect tick — leaving a
  // stuck transparent overlay that swallows every click on the
  // editor. Calling `setIsLg(false)` and `setMetaOpen(false)` from
  // the same matchMedia change handler lets React 18 auto-batch the
  // updates into one commit.
  const [isLg, setIsLg] = useState(() => {
    if (typeof window === 'undefined') {
      return true
    }
    return window.matchMedia('(min-width: 1024px)').matches
  })
  const [metaOpen, setMetaOpen] = useState(isLg)
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)')
    setIsLg(mql.matches)
    const handleChange = (event: MediaQueryListEvent) => {
      setIsLg(event.matches)
      if (!event.matches) {
        setMetaOpen(false)
        setPreviewOpenState(false)
      }
    }
    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [])

  // We sync `metaOpen` ↔ `previewOpen` synchronously inside the
  // toggle setter rather than via `useEffect`. An effect-driven sync
  // would briefly mount `<Sheet open>` while `previewOpen=true` and
  // `metaOpen` is still the stale `true`, leaving Base UI's backdrop
  // attached after the close animation — which blocks every click on
  // the entity underneath.
  const setPreviewOpen = useCallback((updater: boolean | ((prev: boolean) => boolean)) => {
    setPreviewOpenState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      setMetaOpen(!next)
      return next
    })
  }, [])

  return {
    previewOpen,
    setPreviewOpen,
    metaOpen,
    setMetaOpen,
    isLg,
    editorScrollRef,
    previewScrollRef,
  }
}
