import { useMutation } from '@tanstack/react-query'
import { PencilIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { CommentBody } from '@/shared/pt/comment-schema'
import type { CommentFormUser } from '@/shared/types/catalog'
import type {
  CommentItemWire as CommentItemType,
  FindAvatarOutput,
  ReplyCommentInput,
  ReplyCommentOutput,
} from '@/shared/types/comments'

import { orpcQuery } from '@/client/api/orpc-query'
import { useCommentGuest } from '@/client/hooks/use-comment-guest'
import { bodyToPlainText } from '@/shared/pt/utils'
import { joinUrl } from '@/shared/utils/urls'
import { Button } from '@/ui/components/button'
import { Input } from '@/ui/components/input'
import { cn } from '@/ui/lib/cn'
import { CommentBodyEditor, EMPTY_COMMENT_BODY, isCommentBodyBlank } from '@/ui/public/comments/CommentBodyEditor'

export interface CommentReplyFormProps {
  commentKey: string
  user?: CommentFormUser
  /** Currently active reply target id; 0 means top-level reply. */
  replyToId: number
  /** Resolved reply target (for the quoted-author overlay). */
  replyTarget?: CommentItemType
  onCancel: () => void
  onReplied: (comment: CommentItemType, rid: number) => void
}

export function CommentReplyForm({
  commentKey,
  user,
  replyToId,
  replyTarget,
  onCancel,
  onReplied,
}: CommentReplyFormProps) {
  const { profile: guestProfile, saveProfile: saveGuestProfile, clearProfile: clearGuestProfile } = useCommentGuest()
  const isGuestMode = !user && guestProfile !== null

  const [body, setBody] = useState<CommentBody>(EMPTY_COMMENT_BODY)
  const [bodyKey, setBodyKey] = useState(0)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement | null>(null)
  const [avatarSrc, setAvatarSrc] = useState<string>(() => {
    if (user?.admin) {
      return joinUrl('/images/avatar', `${user.id}.png`)
    }
    if (guestProfile?.avatar) {
      return guestProfile.avatar
    }
    return '/images/default-avatar.png'
  })

  useEffect(() => {
    if (user) {
      return
    }
    if (guestProfile?.avatar) {
      setAvatarSrc(guestProfile.avatar)
    } else {
      setAvatarSrc('/images/default-avatar.png')
    }
  }, [guestProfile, user])

  const reply = useMutation({
    ...orpcQuery.comments.replyComment.mutationOptions(),
    onSuccess: (data: ReplyCommentOutput, variables: ReplyCommentInput) => {
      setSubmitError(null)
      onReplied(data.comment, replyToId)
      if (!user) {
        saveGuestProfile({
          name: data.comment.name,
          email: variables.email,
          link: data.comment.link ?? undefined,
          avatar: avatarSrc,
        })
      }
      setBody(EMPTY_COMMENT_BODY)
      setBodyKey((k) => k + 1)
      formRef.current?.reset()
    },
    onError: (error) => {
      setSubmitError(error.message)
    },
  })

  const avatar = useMutation({
    ...orpcQuery.avatar.find.mutationOptions(),
    onSuccess: (payload: FindAvatarOutput) => setAvatarSrc(payload.avatar),
  })

  const admin = user?.admin === true
  const isPending = reply.isPending
  const isReplying = replyToId !== 0 && replyTarget !== undefined

  const onEmailBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    if (admin || isGuestMode) {
      return
    }
    const email = event.currentTarget.value
    if (email && email.includes('@')) {
      avatar.mutate({ email })
    } else {
      setAvatarSrc('/images/default-avatar.png')
    }
  }

  const handleSubmit = (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isCommentBodyBlank(body)) {
      setSubmitError('请输入评论内容。')
      return
    }
    const form = event.currentTarget
    const data = new FormData(form)
    const name = readFormString(data, 'name') ?? user?.name ?? guestProfile?.name ?? ''
    const email = readFormString(data, 'email') ?? user?.email ?? guestProfile?.email ?? ''
    const link = readFormString(data, 'link') ?? guestProfile?.link ?? ''
    const subtitle = readFormString(data, 'subtitle') ?? ''
    const payload: ReplyCommentInput = {
      page_key: commentKey,
      name,
      email,
      link: link !== '' ? link : undefined,
      body,
      rid: replyToId === 0 ? undefined : replyToId,
      subtitle: subtitle === '' ? undefined : subtitle,
    }
    setSubmitError(null)
    reply.mutate(payload)
  }

  return (
    <div id="respond" className="mb-4 md:mb-6">
      <form ref={formRef} id="commentForm" className="flex flex-1" onSubmit={handleSubmit}>
        <div
          className={cn(
            'relative mr-comment-avatar-gap flex size-10 shrink-0 items-center justify-center rounded-full leading-none font-semibold whitespace-nowrap max-md:mr-2.5 max-md:size-7',
            isGuestMode && 'group/guest-avatar cursor-pointer',
          )}
          onClick={isGuestMode ? clearGuestProfile : undefined}
        >
          <img
            alt="头像"
            src={avatarSrc}
            className="size-full rounded-full object-cover"
            height={40}
            width={40}
            decoding="async"
          />
          {isGuestMode && (
            <span className="absolute inset-0 hidden items-center justify-center rounded-full bg-black/40 group-hover/guest-avatar:flex">
              <PencilIcon className="size-4 text-white" />
            </span>
          )}
        </div>
        <div className="flex-1">
          <div className="relative mb-4">
            <CommentBodyEditor
              initialBody={EMPTY_COMMENT_BODY}
              bodyKey={`reply-${bodyKey}`}
              onBodyChange={setBody}
              disabled={isPending}
              className={cn(isReplying && 'pt-10')}
            />
            {isReplying && (
              <ReplyOverlay
                authorName={replyTarget.name}
                originalContent={bodyToPlainText(replyTarget.body).slice(0, 200).trim()}
              />
            )}
          </div>
          <CommentFormFields
            user={user}
            guestProfile={guestProfile}
            commentKey={commentKey}
            replyToId={replyToId}
            onEmailBlur={onEmailBlur}
          />
          {!admin && <CommentFormHoneypot />}
          {!!submitError && <div className="mb-2 text-xs text-alert">{submitError}</div>}
          <div className="flex justify-end gap-2">
            {replyToId !== 0 && (
              <Button
                variant="light"
                id="cancel-comment-reply-link"
                onMouseDown={(event) => event.preventDefault()}
                onClick={onCancel}
              >
                再想想
              </Button>
            )}
            <Button
              name="submit"
              type="submit"
              id="submit"
              variant="default"
              disabled={isPending}
              onMouseDown={(event) => event.preventDefault()}
            >
              {isPending ? '发表中…' : '发表评论'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}

function readFormString(data: FormData, name: string): string | undefined {
  const value = data.get(name)
  return typeof value === 'string' ? value : undefined
}

interface ReplyOverlayProps {
  authorName: string
  originalContent: string
}

const replyingToOverlayClass = cn(
  'pointer-events-none absolute top-[0.4rem] right-3 left-3 z-2',
  'flex items-center gap-1',
  'rounded-sm bg-brand/5 px-2 py-[0.15rem]',
  'text-[0.9rem] text-ink-2/95 opacity-60',
  'truncate',
)

function ReplyOverlay({ authorName, originalContent }: ReplyOverlayProps) {
  return (
    <div className={replyingToOverlayClass}>
      <span className="font-medium">回复 @{authorName}</span>
      {!!originalContent && <span>: {originalContent}</span>}
    </div>
  )
}

/** Off-screen honeypot: humans never see it; bots that fill every input trip schema validation. */
function CommentFormHoneypot() {
  return (
    <div className="absolute left-[-10000px] size-px overflow-hidden" aria-hidden="true">
      <label htmlFor="comment-subtitle">Subtitle</label>
      <input
        id="comment-subtitle"
        name="subtitle"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        defaultValue=""
        aria-label="Honeypot"
      />
    </div>
  )
}

interface CommentFormFieldsProps {
  user?: CommentFormUser
  guestProfile?: { name: string; email: string; link?: string } | null
  commentKey: string
  replyToId: number
  onEmailBlur: (event: React.FocusEvent<HTMLInputElement>) => void
}

function CommentFormFields({ user, guestProfile, commentKey, replyToId, onEmailBlur }: CommentFormFieldsProps) {
  const admin = user?.admin === true
  const hasIdentity = admin || guestProfile !== null
  const nameValue = admin ? user.name : (guestProfile?.name ?? '')
  const emailValue = admin ? user.email : (guestProfile?.email ?? '')
  const linkValue = admin ? (user.website ?? '') : (guestProfile?.link ?? '')

  return (
    <div className="-mx-1 -mt-2 mb-4 flex flex-wrap md:-mx-2 md:-mt-4">
      {hasIdentity ? (
        <input name="name" type="text" readOnly hidden defaultValue={nameValue} aria-label="昵称" />
      ) : (
        <div className="mt-2 box-border w-full max-w-full shrink-0 px-1 md:mt-4 md:w-1/2 md:px-2">
          <label htmlFor="comment-name" className="sr-only">
            昵称
          </label>
          <Input
            id="comment-name"
            className="bg-canvas"
            placeholder="昵称"
            name="name"
            type="text"
            autoComplete="name"
            required
          />
        </div>
      )}
      {hasIdentity ? (
        <input name="email" defaultValue={emailValue} type="email" readOnly hidden aria-label="邮箱" />
      ) : (
        <div className="mt-2 box-border w-full max-w-full shrink-0 px-1 md:mt-4 md:w-1/2 md:px-2">
          <label htmlFor="comment-email" className="sr-only">
            邮箱
          </label>
          <Input
            id="comment-email"
            className="bg-canvas"
            name="email"
            placeholder="邮箱"
            type="email"
            autoComplete="email"
            required
            onBlur={onEmailBlur}
          />
        </div>
      )}
      <input hidden name="page_key" type="text" defaultValue={commentKey} aria-label="页面标识" />
      <input hidden name="rid" type="text" value={String(replyToId)} readOnly aria-label="回复目标" />
      {hasIdentity ? (
        <input name="link" type="url" readOnly hidden defaultValue={linkValue} aria-label="网址" />
      ) : (
        <div className="mt-2 box-border w-full max-w-full shrink-0 px-1 md:mt-4 md:px-2">
          <label htmlFor="comment-url" className="sr-only">
            网址
          </label>
          <Input id="comment-url" className="bg-canvas" placeholder="网址" name="link" type="url" autoComplete="url" />
        </div>
      )}
    </div>
  )
}
