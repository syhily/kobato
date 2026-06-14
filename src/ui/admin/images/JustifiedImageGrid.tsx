import { motion, useReducedMotion } from 'motion/react'
import { useMemo } from 'react'

import type { AdminImageDto } from '@/shared/types/images'

import { transitions } from '@/client/lib/motion'
import { getImageUrl } from '@/shared/types/images'
import { cn } from '@/ui/lib/cn'
import { useDevicePixelRatio } from '@/ui/lib/use-device-pixel-ratio'
import { useElementWidth } from '@/ui/lib/use-element-width'

export interface JustifiedImageGridProps {
  images: AdminImageDto[]
  assetHost: string
  urlTemplate?: string
  targetRowHeight?: number
  gap?: number
  onSelect: (image: AdminImageDto) => void
  className?: string
}

interface RowItem {
  image: AdminImageDto
  width: number
  height: number
}

interface Row {
  height: number
  items: RowItem[]
}

function aspectRatio(image: AdminImageDto): number {
  if (image.width > 0 && image.height > 0) {
    return image.width / image.height
  }
  return 1
}

const MIN_ROW_HEIGHT_RATIO = 0.5
const LAST_ROW_STRETCH_THRESHOLD_RATIO = 0.66

export function buildJustifiedRows(
  images: AdminImageDto[],
  containerWidth: number,
  targetHeight: number,
  gap: number,
): Row[] {
  if (containerWidth <= 0 || images.length === 0) {
    return []
  }

  const minHeight = targetHeight * MIN_ROW_HEIGHT_RATIO
  const lastRowStretchThreshold = containerWidth * LAST_ROW_STRETCH_THRESHOLD_RATIO
  const rows: Row[] = []
  let pending: { image: AdminImageDto; ratio: number }[] = []
  let pendingRatioSum = 0

  const flush = (forceFill: boolean) => {
    if (pending.length === 0) {
      return
    }

    const count = pending.length
    const gaps = gap * (count - 1)

    let height: number
    if (forceFill) {
      height = (containerWidth - gaps) / pendingRatioSum
    } else {
      const widthAtTarget = targetHeight * pendingRatioSum + gaps
      if (widthAtTarget > containerWidth || widthAtTarget >= lastRowStretchThreshold) {
        height = (containerWidth - gaps) / pendingRatioSum
      } else {
        height = targetHeight
      }
    }

    const shouldStretch = forceFill || height !== targetHeight
    const items: RowItem[] = []
    let usedWidth = 0
    for (let i = 0; i < count; i++) {
      const { image, ratio } = pending[i]!
      const isLast = i === count - 1
      let width = height * ratio
      if (shouldStretch && isLast) {
        width = containerWidth - gaps - usedWidth
      } else {
        width = Math.floor(width)
        usedWidth += width
      }
      items.push({ image, width, height })
    }

    rows.push({ height, items })
    pending = []
    pendingRatioSum = 0
  }

  for (const image of images) {
    const ratio = aspectRatio(image)

    if (pending.length === 0) {
      pending.push({ image, ratio })
      pendingRatioSum += ratio
      continue
    }

    const candidateCount = pending.length + 1
    const candidateHeight = (containerWidth - gap * (candidateCount - 1)) / (pendingRatioSum + ratio)

    if (candidateHeight >= targetHeight || candidateHeight >= minHeight) {
      pending.push({ image, ratio })
      pendingRatioSum += ratio
      if (candidateHeight < targetHeight) {
        flush(true)
      }
    } else {
      flush(true)
      pending.push({ image, ratio })
      pendingRatioSum += ratio
    }
  }

  flush(false)
  return rows
}

function targetRowHeightForWidth(width: number): number {
  if (width < 640) {
    return 160
  }
  if (width < 1024) {
    return 200
  }
  return 240
}

export function JustifiedImageGrid({
  images,
  assetHost,
  urlTemplate,
  targetRowHeight,
  gap = 12,
  onSelect,
  className,
}: JustifiedImageGridProps) {
  const { ref, width } = useElementWidth()
  const targetHeight = targetRowHeight ?? targetRowHeightForWidth(width)
  const rows = useMemo(() => buildJustifiedRows(images, width, targetHeight, gap), [images, width, targetHeight, gap])
  const dpr = useDevicePixelRatio()
  const prefersReducedMotion = useReducedMotion()

  return (
    <div ref={ref} className={cn('flex flex-col', className)} style={{ gap }}>
      {width <= 0 ? (
        <JustifiedImageGridSkeleton targetRowHeight={targetHeight} gap={gap} />
      ) : (
        rows.map((row, rowIndex) => (
          <div key={row.items[0]!.image.id} className="flex" style={{ gap, height: row.height }}>
            {row.items.map((item, itemIndex) => {
              const thumbUrl = getImageUrl({
                src: item.image.publicUrl,
                width: Math.ceil(item.width * dpr),
                height: Math.ceil(item.height * dpr),
                quality: 80,
                assetHost,
                urlTemplate,
              })

              return (
                <motion.button
                  key={item.image.id}
                  type="button"
                  onClick={() => onSelect(item.image)}
                  initial={prefersReducedMotion ? undefined : { opacity: 0, y: 8 }}
                  animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
                  transition={
                    prefersReducedMotion
                      ? undefined
                      : {
                          ...transitions.fade,
                          delay: (rowIndex * 0.02 + itemIndex * 0.01) % 0.2,
                        }
                  }
                  whileHover={prefersReducedMotion ? undefined : { scale: 1.02 }}
                  whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
                  className={cn(
                    'group relative block overflow-hidden rounded-xl border bg-muted',
                    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  )}
                  style={{ width: item.width, height: item.height }}
                  aria-label={`查看图片 ${item.image.storagePath}`}
                >
                  <img src={thumbUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                </motion.button>
              )
            })}
          </div>
        ))
      )}
    </div>
  )
}

interface SkeletonProps {
  targetRowHeight?: number
  gap?: number
  className?: string
}

function skeletonWidths(seed: number): number[] {
  const widths: number[] = []
  let remaining = 12
  let i = seed
  while (remaining > 0) {
    const w = Math.min(remaining, 2 + ((i * 7) % 4))
    widths.push(w)
    remaining -= w
    i += 1
  }
  return widths
}

export function JustifiedImageGridSkeleton({ targetRowHeight = 200, gap = 12, className }: SkeletonProps) {
  const prefersReducedMotion = useReducedMotion()
  return (
    <div className={cn('flex flex-col', className)} style={{ gap }}>
      {Array.from({ length: 4 }).map((_, rowIndex) => (
        // oxlint-disable-next-line react/no-array-index-key
        <div key={rowIndex} className="flex" style={{ gap, height: targetRowHeight }}>
          {skeletonWidths(rowIndex).map((span, itemIndex) => {
            const key = `${rowIndex}-${itemIndex}`
            const style = { flex: span }
            return prefersReducedMotion ? (
              <div key={key} className="rounded-xl bg-muted" style={style} />
            ) : (
              <motion.div
                key={key}
                className="rounded-xl bg-muted"
                style={style}
                animate={{ opacity: [0.5, 0.8, 0.5] }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: (rowIndex * 0.15 + itemIndex * 0.05) % 0.5,
                }}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
