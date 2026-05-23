import { useEffect, useState } from 'react'

import { subscribeChunkReload } from '@/client/hooks/use-chunk-error-recovery'
import { cn } from '@/ui/lib/cn'
import { BrandLogo } from '@/ui/public/chrome/BrandLogo'

// Render an opaque brand splash the moment a stale-deploy chunk error
// is detected, so the user sees a calm loading state instead of the
// previous-deploy DOM (or a flash of unstyled blank) while the
// triggered `location.reload()` fetches the new document. The reload
// itself is scheduled by `triggerChunkReload()` across two animation
// frames so this overlay has a chance to paint first.
//
// Mount once in `root.tsx`'s `Layout` (the only ancestor common to
// both the App tree and the ErrorBoundary tree) so the splash works
// regardless of which path tripped the recovery.
export function ChunkReloadOverlay() {
  const [pending, setPending] = useState(false)

  useEffect(() => subscribeChunkReload(() => setPending(true)), [])

  if (!pending) {
    return null
  }

  return (
    <output
      aria-live="polite"
      aria-label="正在加载最新版本"
      className={cn('fixed inset-0 flex items-center justify-center', 'bg-surface-body', 'z-(--z-nav-splash)')}
    >
      <div className="relative aspect-[1237/300] w-[min(80vw,560px)]">
        <BrandLogo alt="" className="h-full w-full select-none" draggable={false} />
      </div>
    </output>
  )
}
