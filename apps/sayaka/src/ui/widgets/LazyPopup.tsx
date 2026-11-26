import type { PopupProps } from '@sayaka/ui/widgets/Popup'

import { Suspense, lazy } from 'react'

const Popup = lazy(() => import('@sayaka/ui/widgets/Popup').then((module) => ({ default: module.Popup })))

export function LazyPopup(props: PopupProps) {
  return (
    <Suspense fallback={null}>
      <Popup {...props} />
    </Suspense>
  )
}
