import type { ImgHTMLAttributes, Ref } from 'react'

import { useThumbhashBackground } from '@kobato/client/hooks/use-thumbhash-bg'
import { cn } from '@kobato/editor/lib/cn'
import { useImageLoaded } from '@kobato/editor/widgets/use-image-loaded'
import { useAssetsSettings } from '@kobato/shared/lib/blog-config-context'
import { getImageSrcset, getImageUrl } from '@kobato/shared/types/images'

export interface RawImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'width' | 'height' | 'ref'> {
  src: string
  alt: string
  width: number
  height: number
  thumbhash?: string
  quality?: number
  sizes?: string
  ref?: Ref<HTMLImageElement>
  assetHost?: string
  urlTemplate?: string
}

// Exported so plain `<img>` consumers can reuse the same dark-mode dimming.
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

export function Image(props: Omit<RawImageProps, 'assetHost' | 'urlTemplate'>) {
  const { asset, storage } = useAssetsSettings()
  return <RawImage {...props} assetHost={asset.host} urlTemplate={storage.urlTemplate} />
}
