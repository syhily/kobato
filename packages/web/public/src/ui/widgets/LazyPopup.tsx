import type { PopupProps } from '@kobato/web-public/ui/widgets/Popup.tsx'

import { Suspense, lazy } from 'react'

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
