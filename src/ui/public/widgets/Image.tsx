import type { ImgHTMLAttributes, Ref } from 'react'

import { useThumbhashBackground } from '@/client/hooks/use-thumbhash-bg'
import { useAssetsSettings } from '@/shared/lib/blog-config-context'
import { getImageSrcset, getImageUrl } from '@/shared/types/images'
import { cn } from '@/ui/lib/cn'
import { useImageLoaded } from '@/ui/public/widgets/use-image-loaded'

export interface RawImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'width' | 'height' | 'ref'> {
  src: string
  alt: string
  width: number
  height: number
  thumbhash?: string
  /** Pass-through for the image service; defaults to 100. */
  quality?: number
  /** Responsive `sizes` attribute. When provided, a `srcset` is generated automatically. */
  sizes?: string
  ref?: Ref<HTMLImageElement>
  /** Asset host used for CDN image transforms. */
  assetHost?: string
  /** Transform template for the CDN; used together with `assetHost`. */
  urlTemplate?: string
}

// Dark mode dims images so they don't glare against the dark canvas. The
// filter combo is brightness 0.72 (knocks back the highlights), contrast 0.95
// (softens shadows so the dimmed image still reads), and saturate 0.9 (a
// slight desaturate so the colours sit closer to the muted ink palette the
// surrounding chrome uses). The whole thing rides a 300 ms transition so the
// swap on theme flip eases rather than snapping. Light mode generates no
// filter declaration at all, so the regular paint pipeline is untouched.
//
// Exported so plain `<img>` consumers that bypass `RawImage` (PortableText
// `BlockImage`, the Friends grid, etc.) can still pick up the same dimming.
export const DARK_IMAGE_DIM_CLASS =
  'transition-[filter] duration-300 dark:[filter:brightness(0.72)_contrast(0.95)_saturate(0.9)]'

export function RawImage({
  src,
  alt,
  width,
  height,
  thumbhash,
  quality,
  sizes,
  assetHost,
  urlTemplate,
  loading = 'lazy',
  decoding = 'async',
  className,
  style,
  onLoad,
  ref: externalRef,
  ...rest
}: RawImageProps) {
  const { ref, loaded, handleLoad } = useImageLoaded(externalRef, onLoad)
  const thumbhashStyle = useThumbhashBackground(thumbhash, loaded)
  const srcset =
    sizes !== undefined && sizes !== ''
      ? getImageSrcset({ src, width, height, quality, assetHost: assetHost ?? '', urlTemplate })
      : undefined
  const mergedStyle: React.CSSProperties | undefined =
    thumbhashStyle === undefined ? style : style === undefined ? thumbhashStyle : { ...thumbhashStyle, ...style }

  return (
    <img
      {...rest}
      ref={ref}
      src={getImageUrl({ src, width, height, quality, assetHost: assetHost ?? '', urlTemplate })}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      decoding={decoding}
      sizes={sizes}
      srcSet={srcset}
      className={cn(DARK_IMAGE_DIM_CLASS, className)}
      style={mergedStyle}
      onLoad={handleLoad}
    />
  )
}

// TODO: migrate callers to pass `assetHost` / `urlTemplate` explicitly
// and consume `RawImage` directly, so this wrapper can be removed.
export function Image(props: Omit<RawImageProps, 'assetHost' | 'urlTemplate'>) {
  const { asset, storage } = useAssetsSettings()
  return <RawImage {...props} assetHost={asset.host} urlTemplate={storage.urlTemplate} />
}
