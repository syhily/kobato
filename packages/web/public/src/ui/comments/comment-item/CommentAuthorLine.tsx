import type { CommentItemWire as CommentItemType } from '@kobato/api/contracts/public/comments'

import { avatarImageUrl } from '@kobato/assets/avatar'
import { brandingVersionSuffix } from '@kobato/settings/presentation'
import { AvatarSkeleton } from '@kobato/ui/components/avatar'
import { cn } from '@kobato/ui/lib/cn'
import { safeHref } from '@kobato/utils/safe-url'
import { useAssetsSettingsOptional } from '@kobato/web-client/settings/blog-settings-context'
import { commentAuthorClass, commentAvatarClass } from '@kobato/web-public/ui/comments/comment-item/presentation'
import { useEffect, useRef, useState } from 'react'

type AvatarLoadState = 'loading' | 'loaded' | 'error'

export function CommentAvatar({ comment, depth }: { comment: CommentItemType; depth: number }) {
  const assets = useAssetsSettingsOptional()
  const defaultAvatar = `/images/default-avatar.png${brandingVersionSuffix(assets?.branding?.defaultAvatar)}`
  const avatarSrc = avatarImageUrl(comment.userId)
  const imageRef = useRef<HTMLImageElement>(null)
  const [loadState, setLoadState] = useState<AvatarLoadState>('loading')

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
