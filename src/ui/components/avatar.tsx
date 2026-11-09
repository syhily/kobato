import type { ComponentProps } from 'react'

import { Avatar as BaseAvatar } from '@base-ui/react/avatar'
import { useState } from 'react'

import { cn } from '@/ui/lib/cn'

type AvatarLoadingStatus = 'idle' | 'loading' | 'loaded' | 'error'

function Avatar({ className, ...props }: ComponentProps<typeof BaseAvatar.Root>) {
  return (
    <BaseAvatar.Root
      data-slot="avatar"
      className={cn('relative flex size-8 shrink-0 overflow-hidden rounded-full', className)}
      {...props}
    />
  )
}

function AvatarSkeleton({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      data-slot="avatar-skeleton"
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 animate-pulse rounded-full bg-accent', className)}
      {...props}
    />
  )
}

function AvatarImage({ className, onLoadingStatusChange, ...props }: ComponentProps<typeof BaseAvatar.Image>) {
  const [loadState, setLoadState] = useState<AvatarLoadingStatus>('idle')
  return (
    <>
      <BaseAvatar.Image
        data-slot="avatar-image"
        className={cn('aspect-square size-full', className)}
        onLoadingStatusChange={(next) => {
          setLoadState(next)
          onLoadingStatusChange?.(next)
        }}
        {...props}
      />
      {(loadState === 'idle' || loadState === 'loading') && <AvatarSkeleton />}
    </>
  )
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

export { Avatar, AvatarFallback, AvatarImage, AvatarSkeleton }
