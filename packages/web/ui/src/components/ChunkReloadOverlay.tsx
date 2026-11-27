import { BrandLogo } from '@kobato/ui/components/BrandLogo'
import { subscribeChunkReload } from '@kobato/ui/lib/chunk-reload'
import { cn } from '@kobato/ui/lib/cn'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { useEffect, useState } from 'react'

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
