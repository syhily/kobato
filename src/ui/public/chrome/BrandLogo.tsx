import type { ImgHTMLAttributes } from 'react'

import { brandingVersion } from '@/shared/config/utils'
import { useAssetsSettingsOptional } from '@/shared/lib/blog-config-context'
import { cn } from '@/ui/lib/cn'

export interface BrandLogoProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  className?: string
}

export function BrandLogo({ className, alt = '且听书吟', ...rest }: BrandLogoProps) {
  const assets = useAssetsSettingsOptional()
  const qs = brandingVersion(assets?.branding)
  const v = qs ? `?v=${qs}` : ''
  return (
    <>
      <img src={`/logo-large.svg${v}`} alt={alt} className={cn('block dark:hidden', className)} {...rest} />
      <img
        src={`/logo-large-dark.svg${v}`}
        alt={alt}
        className={cn('hidden dark:block', className)}
        aria-hidden
        {...rest}
      />
    </>
  )
}
