import { memo } from 'react'

import type { AdminImageDto } from '@/shared/types/images'

import { useAssetsSettings } from '@/shared/lib/blog-config-context'
import { getImageUrl } from '@/shared/types/images'
import { cn } from '@/ui/lib/cn'

interface ImageCardProps {
  image: AdminImageDto
  onClick: () => void
}

// Grid card. Renders a square thumbnail through the configured image
// URL transform (300×300 cropped). Memoized so the parent re-render
// triggered by an unrelated state tick (filter debounce, dialog open,
// confirm-prompt) only reconciles the cards whose props actually
// changed.
export const ImageCard = memo(function ImageCard({ image, onClick }: ImageCardProps) {
  const { asset, storage } = useAssetsSettings()
  const thumbUrl = getImageUrl({
    src: image.publicUrl,
    width: 300,
    height: 300,
    quality: 80,
    assetHost: asset.host,
    urlTemplate: storage.urlTemplate,
  })

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`查看图片 ${image.storagePath}`}
      className={cn(
        'group relative block aspect-square w-full overflow-hidden rounded-md border bg-muted',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        'transition-shadow hover:shadow-md',
      )}
    >
      <img
        src={thumbUrl}
        alt=""
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
      />
    </button>
  )
})
