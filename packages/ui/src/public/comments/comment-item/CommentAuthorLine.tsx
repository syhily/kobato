import type { CommentItemWire as CommentItemType } from '@kobato/shared/contracts/comments'

import { avatarImageUrl } from '@kobato/shared/utils/avatar'
import { safeHref } from '@kobato/shared/utils/safe-url'
import { cn } from '@kobato/ui/lib/cn'
import { commentAuthorClass, commentAvatarClass } from '@kobato/ui/public/comments/comment-item/helpers'

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
        src={avatarImageUrl(comment.userId)}
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
