import type { ComponentProps } from 'react'

import { Avatar as BaseAvatar } from '@base-ui/react/avatar'

import { cn } from '@/ui/lib/cn'

function Avatar({ className, ...props }: ComponentProps<typeof BaseAvatar.Root>) {
  return (
    <BaseAvatar.Root
      data-slot="avatar"
      className={cn('relative flex size-8 shrink-0 overflow-hidden rounded-full', className)}
      {...props}
    />
  )
}

function AvatarImage({ className, ...props }: ComponentProps<typeof BaseAvatar.Image>) {
  return <BaseAvatar.Image data-slot="avatar-image" className={cn('aspect-square size-full', className)} {...props} />
}

function AvatarFallback({ className, 'aria-label': ariaLabel, ...props }: ComponentProps<typeof BaseAvatar.Fallback>) {
  return (
    <BaseAvatar.Fallback
      data-slot="avatar-fallback"
      className={cn('flex size-full items-center justify-center rounded-full bg-muted', className)}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      {...props}
    />
  )
}

export { Avatar, AvatarFallback, AvatarImage }
