import { Suspense, lazy } from 'react'

import type { PopupProps } from '@/ui/public/widgets/Popup'

// `Popup` is portal-mounted and client-only by design (it renders null on
// the server, and null whenever closed), so the WHOLE component loads
// behind a lazy boundary instead of riding the public bundle — and call
// sites mount it only while open. Inside the component every motion
// element goes through `lazy-motion.tsx`, so the motion runtime itself is
// fetched on first open, not with the page. The null fallback is
// behavior-identical: a closed popup renders nothing, and an open click
// during the one-time chunk fetch shows the dialog a tick later.
const Popup = lazy(() => import('@/ui/public/widgets/Popup').then((module) => ({ default: module.Popup })))

export function LazyPopup(props: PopupProps) {
  return (
    <Suspense fallback={null}>
      <Popup {...props} />
    </Suspense>
  )
}
