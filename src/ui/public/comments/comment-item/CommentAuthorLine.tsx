import type { CommentItemWire as CommentItemType } from '@/shared/contracts/comments'

import { safeHref } from '@/shared/utils/safe-url'
import { joinUrl } from '@/shared/utils/urls'
import { cn } from '@/ui/lib/cn'
import { commentAuthorClass, commentAvatarClass } from '@/ui/public/comments/comment-item/helpers'

export function CommentAvatar({ comment, depth }: { comment: CommentItemType; depth: number }) {
  return (
    <div
      className={commentAvatarClass(depth)}
      style={{
        backgroundImage: "url('/images/default-avatar.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <img
        alt={comment.name}
        src={joinUrl('/images/avatar', `${comment.userId}.png`)}
        className="size-full rounded-full object-cover"
        height={40}
        width={40}
        loading="lazy"
        decoding="async"
      />
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
