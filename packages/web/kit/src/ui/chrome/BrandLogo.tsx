import type { ImgHTMLAttributes } from 'react'

import { brandingVersionSuffix } from '@kobato/settings/presentation'
import { cn } from '@kobato/ui/lib/cn'
import { useAssetsSettingsOptional } from '@kobato/web-kit/ui/lib/blog-settings-context'

export interface BrandLogoProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  className?: string
  alt: string
}

export function BrandLogo({ className, alt, ...rest }: BrandLogoProps) {
  const assets = useAssetsSettingsOptional()
  const light = brandingVersionSuffix(assets?.branding?.logoLargeSvg)
  const dark = brandingVersionSuffix(assets?.branding?.logoLargeDarkSvg)
  return (
    <>
      <img src={`/logo-large.svg${light}`} alt={alt} className={cn('block dark:hidden', className)} {...rest} />
      <img
        src={`/logo-large-dark.svg${dark}`}
        alt={alt}
        className={cn('hidden dark:block', className)}
        aria-hidden
        {...rest}
      />
    </>
  )
}
