import { useCallback, useRef, useState } from 'react'

import { useSyncScroll } from '@/client/hooks/use-sync-scroll'
import { useAdminChromeFocus, useAdminScrollTopLift } from '@/ui/admin/shell/AdminShell'
import { useMediaQuery } from '@/ui/lib/use-media-query'

export function useEditorShellLayout() {
  const [previewOpen, setPreviewOpenState] = useState(false)
  useAdminChromeFocus(previewOpen)
  useAdminScrollTopLift(true)

  const editorScrollRef = useRef<HTMLDivElement>(null)
  const previewScrollRef = useRef<HTMLDivElement>(null)
  useSyncScroll({ editorRef: editorScrollRef, previewRef: previewScrollRef, enabled: previewOpen })

  const isLg = useMediaQuery('(min-width: 1024px)', true)
  const [metaOpen, setMetaOpen] = useState(isLg)
  // Adjust state during render (not in an effect): when the viewport
  // drops below lg, force both panels closed.
  const [wasLg, setWasLg] = useState(isLg)
  if (isLg !== wasLg) {
    setWasLg(isLg)
    if (!isLg) {
      setMetaOpen(false)
      setPreviewOpenState(false)
    }
  }

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
