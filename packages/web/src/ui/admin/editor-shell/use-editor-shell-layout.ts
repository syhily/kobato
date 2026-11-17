import { useMediaQuery } from '@kobato/ui/lib/use-media-query.ts'
import { useAdminScrollTopLift } from '@kobato/web/ui/admin/shell/AdminShell.tsx'
import { useState } from 'react'

export function useEditorShellLayout() {
  useAdminScrollTopLift(true)

  const isLg = useMediaQuery('(min-width: 1024px)', true)
  const isMobile = useMediaQuery('(max-width: 767px)', false)
  // Only mobile starts closed; SSR defaults to the expanded non-mobile layout.
  const [metaOpen, setMetaOpen] = useState(!isMobile)
  // Close the Sheet when entering mobile; widening preserves the user's choice.
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
