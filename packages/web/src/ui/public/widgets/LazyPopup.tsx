import { Suspense, lazy } from 'react'

import type { PopupProps } from './Popup'

// Popup is portal-mounted and browser-only, rendering nothing on the server and nothing
// while closed, so the whole component loads behind a lazy boundary with a null fallback.
const Popup = lazy(() => import('./Popup').then((module) => ({ default: module.Popup })))

export function LazyPopup(props: PopupProps) {
  return (
    <Suspense fallback={null}>
      <Popup {...props} />
    </Suspense>
  )
}
