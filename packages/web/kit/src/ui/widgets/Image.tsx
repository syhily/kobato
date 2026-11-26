import type { ImgHTMLAttributes, Ref, CSSProperties } from 'react'

import { getImageSrcset, getImageUrl } from '@kobato/assets/images'
import { cn } from '@kobato/ui/lib/cn'
import { useAssetsSettings, useSiteIdentity } from '@kobato/web-kit/ui/lib/blog-settings-context'
import { useImageLoaded } from '@kobato/web-kit/ui/widgets/use-image-loaded'
import { useThumbhashBackground } from '@kobato/web-kit/ui/widgets/use-thumbhash-bg'

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
  siteOrigin?: string
}

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
  siteOrigin,
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
      ? getImageSrcset({ src, width, height, quality, assetHost: assetHost ?? '', urlTemplate, siteOrigin })
      : undefined
  const mergedStyle: CSSProperties | undefined =
    thumbhashStyle === undefined ? style : style === undefined ? thumbhashStyle : { ...thumbhashStyle, ...style }

  return (
    <img
      {...rest}
      ref={ref}
      src={getImageUrl({ src, width, height, quality, assetHost: assetHost ?? '', urlTemplate, siteOrigin })}
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

export function Image(props: Omit<RawImageProps, 'assetHost' | 'urlTemplate' | 'siteOrigin'>) {
  const { asset, storage } = useAssetsSettings()
  const { website } = useSiteIdentity()
  return <RawImage {...props} assetHost={asset.host} urlTemplate={storage.urlTemplate} siteOrigin={website} />
}
