import { useState } from 'react'

import { useAdminScrollTopLift } from '@/ui/admin/shell/AdminShell'
import { useMediaQuery } from '@/ui/lib/use-media-query'

export function useEditorShellLayout() {
  useAdminScrollTopLift(true)

  const isLg = useMediaQuery('(min-width: 1024px)', true)
  // The meta panel starts closed at every viewport (mx-space parity: the
  // writing column owns the screen until the author asks for the panel);
  // dropping below lg still force-closes it into the Sheet.
  const [metaOpen, setMetaOpen] = useState(false)
  // Render-phase adjustment: when the viewport drops below lg, force the panel closed.
  const [wasLg, setWasLg] = useState(isLg)
  if (isLg !== wasLg) {
    setWasLg(isLg)
    if (!isLg) {
      setMetaOpen(false)
    }
  }

  return {
    metaOpen,
    setMetaOpen,
    isLg,
  }
}
