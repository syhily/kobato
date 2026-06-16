import { useCallback, useEffect, useRef, useState } from 'react'

import { useSyncScroll } from '@/client/hooks/use-sync-scroll'
import { useAdminChromeFocus, useAdminScrollTopLift } from '@/ui/admin/shell/AdminShell'

export function useEditorShellLayout() {
  const [previewOpen, setPreviewOpenState] = useState(false)
  useAdminChromeFocus(previewOpen)
  useAdminScrollTopLift(true)

  const editorScrollRef = useRef<HTMLDivElement>(null)
  const previewScrollRef = useRef<HTMLDivElement>(null)
  useSyncScroll({ editorRef: editorScrollRef, previewRef: previewScrollRef, enabled: previewOpen })

  const [isLg, setIsLg] = useState(() => {
    if (typeof window === 'undefined') {
      return true
    }
    return window.matchMedia('(min-width: 1024px)').matches
  })
  const [metaOpen, setMetaOpen] = useState(isLg)
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)')
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
