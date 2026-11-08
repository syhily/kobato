import { useEffect, useState } from 'react'

import { subscribeChunkReload } from '@/client/hooks/use-chunk-error-recovery'
import { cn } from '@/ui/lib/cn'
import { useI18n } from '@/ui/lib/I18nProvider'
import { BrandLogo } from '@/ui/public/chrome/BrandLogo'

export function ChunkReloadOverlay() {
  const [pending, setPending] = useState(false)
  const { t } = useI18n()

  useEffect(() => subscribeChunkReload(() => setPending(true)), [])

  if (!pending) {
    return null
  }

  return (
    <output
      aria-live="polite"
      aria-label={t('public.chrome.loadingLatest')}
      className={cn('fixed inset-0 flex items-center justify-center', 'bg-surface-body', 'z-(--z-nav-splash)')}
    >
      <div className="relative aspect-[1237/300] w-[min(80vw,560px)]">
        <BrandLogo alt="" className="h-full w-full select-none" draggable={false} />
      </div>
    </output>
  )
}
