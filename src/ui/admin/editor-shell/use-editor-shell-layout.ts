import { useEffect, useRef, useState } from 'react'

import { useAdminScrollTopLift } from '@/ui/admin/shell/AdminShell'

export function useEditorShellLayout() {
  useAdminScrollTopLift(true)

  const editorScrollRef = useRef<HTMLDivElement>(null)

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
      // Meta visibility follows the breakpoint both ways: the panel is shown
      // whenever the viewport is wide enough and hidden (sheet mode) when it
      // isn't — it must never END UP hidden by default on a wide screen just
      // because the window was narrow at some point.
      setMetaOpen(event.matches)
    }
    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [])

  return {
    metaOpen,
    setMetaOpen,
    isLg,
    editorScrollRef,
  }
}
