import type { PopupProps } from '@kobato/web-public/ui/widgets/Popup.tsx'

import { Suspense, lazy } from 'react'

// Popup is portal-mounted and browser-only, rendering nothing on the server and nothing
// while closed, so the whole component loads behind a lazy boundary with a null fallback.
const Popup = lazy(() =>
  import('@kobato/web-public/ui/widgets/Popup.tsx').then((module) => ({ default: module.Popup })),
)

export function LazyPopup(props: PopupProps) {
  return (
    <Suspense fallback={null}>
      <Popup {...props} />
    </Suspense>
  )
}
