import { useMediaQuery } from '@kobato/ui/lib/use-media-query'
import { useState } from 'react'

import { useAdminScrollTopLift } from '@/ui/shell/AdminShell'

export function useEditorShellLayout() {
  useAdminScrollTopLift(true)

  const isLg = useMediaQuery('(min-width: 1024px)', true)
  const isMobile = useMediaQuery('(max-width: 767px)', false)
  const [metaOpen, setMetaOpen] = useState(!isMobile)
  const [wasMobile, setWasMobile] = useState(isMobile)
  if (isMobile !== wasMobile) {
    setWasMobile(isMobile)
    if (isMobile) {
      setMetaOpen(false)
    }
  }

  return {
    metaOpen,
    setMetaOpen,
    isLg,
  }
}
