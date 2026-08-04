import { subscribeChunkReload } from '@kobato/client/hooks/use-chunk-error-recovery'
import { cn } from '@kobato/ui/lib/cn'
import { BrandLogo } from '@kobato/ui/public/chrome/BrandLogo'
import { useEffect, useState } from 'react'

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
