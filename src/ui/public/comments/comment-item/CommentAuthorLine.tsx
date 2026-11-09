import { useEffect, useRef, useState } from 'react'

import type { CommentItemWire as CommentItemType } from '@/shared/contracts/comments'

import { brandingVersionSuffix } from '@/shared/config/utils'
import { useAssetsSettingsOptional } from '@/shared/lib/blog-config-context'
import { avatarImageUrl } from '@/shared/utils/avatar'
import { safeHref } from '@/shared/utils/safe-url'
import { AvatarSkeleton } from '@/ui/components/avatar'
import { cn } from '@/ui/lib/cn'
import { commentAuthorClass, commentAvatarClass } from '@/ui/public/comments/comment-item/helpers'

type AvatarLoadState = 'loading' | 'loaded' | 'error'

export function CommentAvatar({ comment, depth }: { comment: CommentItemType; depth: number }) {
  const assets = useAssetsSettingsOptional()
  const defaultAvatar = `/images/default-avatar.png${brandingVersionSuffix(assets?.branding?.defaultAvatar)}`
  const avatarSrc = avatarImageUrl(comment.userId)
  const imageRef = useRef<HTMLImageElement>(null)
  const [loadState, setLoadState] = useState<AvatarLoadState>('loading')

  // A cached image can finish before hydration attaches `onLoad`; resolve that case on mount.
  useEffect(() => {
    const image = imageRef.current
    if (!image) {
      return
    }
    if (!image.complete) {
      setLoadState('loading')
      return
    }
    setLoadState(image.naturalWidth > 0 ? 'loaded' : 'error')
  }, [])

  return (
    <div
      className={commentAvatarClass(depth)}
      style={{
        backgroundImage: `url('${defaultAvatar}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <img
        ref={imageRef}
        alt={comment.name}
        src={avatarSrc}
        className="size-full rounded-full object-cover"
        height={40}
        width={40}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoadState('loaded')}
        onError={() => setLoadState('error')}
      />
      {loadState === 'loading' && <AvatarSkeleton />}
    </div>
  )
}

export function CommentAuthorLine({ comment }: { comment: CommentItemType }) {
  const authorHref = safeHref(comment.link)
  return (
    <div className={commentAuthorClass}>
      {authorHref === undefined ? (
        comment.name
      ) : (
        <a href={authorHref} rel="nofollow noreferrer" target="_blank" className="align-middle">
          {comment.name}
        </a>
      )}
      {comment.badgeName && (
        <span
          className={cn(
            'inline-flex shrink-0 items-center',
            'px-1.5 py-0.5 leading-badge whitespace-nowrap',
            'rounded-full text-badge font-bold',
          )}
          style={{
            backgroundColor: comment.badgeColor || 'var(--brand)',
            color: comment.badgeTextColor || 'var(--canvas)',
          }}
        >
          {comment.badgeName}
        </span>
      )}
    </div>
  )
}
