import type { ImgHTMLAttributes, Ref } from 'react'

import { useEffect, useState } from 'react'

import { orpc } from '@/client/api/client'
import { useThumbhashBackground } from '@/client/hooks/use-thumbhash-bg'
import { useAssetsSettings, useSiteIdentity } from '@/shared/lib/blog-config-context'
import { getImageSrcset, type ResolvedImageMeta } from '@/shared/types/images'
import { createBoundedMap } from '@/shared/utils/memo'
import { cn } from '@/ui/lib/cn'
import { useImageMeta } from '@/ui/pt/image-meta-context'
import { DARK_IMAGE_DIM_CLASS } from '@/ui/public/widgets/Image'
import { useImageLoaded } from '@/ui/public/widgets/use-image-loaded'

export type BlockImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'ref'> & {
  'data-thumbhash'?: string
  ref?: Ref<HTMLImageElement>
}

const imageMetaBySrcCache = createBoundedMap<string, ResolvedImageMeta>(256)

export function BlockImage({
  alt = '',
  loading = 'lazy',
  decoding = 'async',
  style,
  onLoad,
  ref: externalRef,
  ...rest
}: BlockImageProps) {
  const src = typeof rest.src === 'string' ? rest.src : undefined
  const imageMeta = useImageMeta()
  const meta = src ? imageMeta?.[src] : undefined
  const { asset, storage } = useAssetsSettings()
  const { website } = useSiteIdentity()

  const propWidth = readPositiveNumber(rest.width) ?? meta?.width
  const propHeight = readPositiveNumber(rest.height) ?? meta?.height
  const propThumbhash = rest['data-thumbhash'] ?? meta?.thumbhash

  const [resolvedMeta, setResolvedMeta] = useState<ResolvedImageMeta | null>(null)
  const { ref: setRef, loaded, handleLoad } = useImageLoaded(externalRef, onLoad)

  // Resolve cached meta during render — no setState-in-effect cascade.
  const cachedMeta = src !== undefined && !src.startsWith('data:') ? (imageMetaBySrcCache.get(src) ?? null) : null
  const effectiveResolved = resolvedMeta ?? cachedMeta
  const thumbhash = effectiveResolved?.thumbhash ?? propThumbhash
  const width = effectiveResolved?.width ?? propWidth
  const height = effectiveResolved?.height ?? propHeight

  const srcset =
    src !== undefined && width !== undefined && height !== undefined
      ? getImageSrcset({
          src,
          width,
          height,
          assetHost: asset.host,
          urlTemplate: storage.urlTemplate,
          siteOrigin: website,
          breakpoints: [256, 512, 768, 1024],
        })
      : undefined

  useEffect(() => {
    if (propThumbhash !== undefined && propThumbhash !== '' && propWidth !== undefined && propHeight !== undefined) {
      return
    }
    if (src === undefined || src === '' || src.startsWith('data:')) {
      return
    }
    if (imageMetaBySrcCache.has(src)) {
      return
    }

    let cancelled = false
    void orpc.image
      .resolveThumbhash({ src })
      .then((data) => {
        if (cancelled) {
          return
        }
        const next: ResolvedImageMeta = {}
        if (typeof data.thumbhash === 'string' && data.thumbhash !== '') {
          next.thumbhash = data.thumbhash
        }
        if (typeof data.width === 'number' && data.width > 0) {
          next.width = data.width
        }
        if (typeof data.height === 'number' && data.height > 0) {
          next.height = data.height
        }
        if (next.thumbhash !== undefined || next.width !== undefined || next.height !== undefined) {
          imageMetaBySrcCache.set(src, next)
          // oxlint-disable-next-line promise/no-callback-in-promise -- setResolvedMeta is a React state setter, not a traditional callback
          setResolvedMeta(next)
        }
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [propThumbhash, propWidth, propHeight, src])

  const thumbhashStyle = useThumbhashBackground(thumbhash, loaded)
  const mergedStyle =
    thumbhashStyle === undefined ? style : style === undefined ? thumbhashStyle : { ...thumbhashStyle, ...style }

  const { className, ...imgRest } = rest
  const hasDimensions =
    (typeof imgRest.width === 'number' && imgRest.width > 0) || (typeof width === 'number' && width > 0)
  const aspectStyle: React.CSSProperties | undefined = hasDimensions ? undefined : { aspectRatio: '16/9' }
  const finalStyle: React.CSSProperties | undefined =
    aspectStyle === undefined
      ? mergedStyle
      : mergedStyle === undefined
        ? aspectStyle
        : { ...aspectStyle, ...mergedStyle }

  return (
    <img
      {...imgRest}
      ref={setRef}
      width={imgRest.width ?? width}
      height={imgRest.height ?? height}
      alt={alt}
      loading={loading}
      decoding={decoding}
      sizes="100vw"
      srcSet={srcset}
      className={cn(DARK_IMAGE_DIM_CLASS, className)}
      style={finalStyle}
      onLoad={handleLoad}
    />
  )
}

function readPositiveNumber(value: ImgHTMLAttributes<HTMLImageElement>['width']): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }
  return undefined
}
