import { useMediaQuery } from '@kobato/ui/lib/use-media-query.ts'
import { useAdminScrollTopLift } from '@kobato/web-admin/ui/shell/AdminShell.tsx'
import { useState } from 'react'

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
