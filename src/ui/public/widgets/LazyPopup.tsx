import { Suspense, lazy } from 'react'

import type { PopupProps } from '@/ui/public/widgets/Popup'

// `Popup` orchestrates several motion elements plus AnimatePresence — too
// deeply animated for the plain-div fallback of `lazy-motion.tsx`. But the
// component is portal-mounted and client-only by design (it renders null on
// the server, and null whenever closed), so the WHOLE component — and the
// motion runtime it pulls — loads behind a lazy boundary instead of riding
// the public bundle. The null fallback is behavior-identical: a closed
// popup renders nothing, and an open click during the one-time chunk fetch
// shows the dialog a tick later.
const Popup = lazy(() => import('@/ui/public/widgets/Popup').then((module) => ({ default: module.Popup })))

export function LazyPopup(props: PopupProps) {
  return (
    <Suspense fallback={null}>
      <Popup {...props} />
    </Suspense>
  )
}
