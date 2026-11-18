import type { ImgHTMLAttributes } from 'react'

import { brandingVersionSuffix } from '@kobato/settings/presentation.ts'
import { cn } from '@kobato/ui/lib/cn.ts'
import { useAssetsSettingsOptional } from '@kobato/web-client/settings/blog-settings-context.tsx'

export interface BrandLogoProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  className?: string
  /** Accessible name — the configured site title, or `''` when the logo is decorative. */
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
