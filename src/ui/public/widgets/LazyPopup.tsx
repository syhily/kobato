import { Suspense, lazy } from 'react'

import type { PopupProps } from '@/ui/public/widgets/Popup'

// Popup is portal-mounted and client-only (renders null on the server and when
// closed), so the whole component loads behind a lazy boundary; the null fallback
// is behavior-identical.
const Popup = lazy(() => import('@/ui/public/widgets/Popup').then((module) => ({ default: module.Popup })))

export function LazyPopup(props: PopupProps) {
  return (
    <Suspense fallback={null}>
      <Popup {...props} />
    </Suspense>
  )
}
