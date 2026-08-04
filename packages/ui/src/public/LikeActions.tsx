import type { DecreaseLikeOutput, IncreaseLikeOutput, ValidateLikeTokenOutput } from '@kobato/shared/types/likes'

import { orpcQuery } from '@kobato/client/api/orpc-query'
import { useSiteIdentity } from '@kobato/shared/lib/blog-config-context'
import { joinUrl } from '@kobato/shared/utils/urls'
import { Button } from '@kobato/ui/components/button'
import { IconButtonContent } from '@kobato/ui/components/icon-button-content'
import { QQIcon, WechatIcon, WeiboIcon } from '@kobato/ui/icons/brand'
import { cn } from '@kobato/ui/lib/cn'
import { QRDialog } from '@kobato/ui/public/widgets/QRDialog'
import { useMutation } from '@tanstack/react-query'
import { HeartIcon } from 'lucide-react'
import {
  startTransition,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

export interface LikeButtonProps {
  /** Stable URL — used as the `localStorage` namespace for the like token. */
  permalink: string
  /** Metric `public_id` UUID — the wire key the like API actions expect. */
  commentKey: string
  likes: number
}

const LIKE_TOKENS_KEY = 'like-tokens'

// No-op subscription for the mount-detection store below (the snapshot
// flips on its own once hydration commits).
const emptySubscribe = () => () => undefined

// `@number-flow/react` is interaction-only chrome: the digit-roll animation
// matters when the count changes on a like/unlike, not on first paint. Load
// it lazily so it stays out of the public pages' synchronous bundle. The
// Suspense fallback is the plain number, so SSR output and the first
// hydrated render are byte-identical (no hydration mismatch, no layout
// shift), and the displayed count stays correct if it changes while the
// chunk is still in flight.
const NumberFlow = lazy(() => import('@number-flow/react'))

function isRecordOfStrings(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  for (const [, v] of Object.entries(value)) {
    if (typeof v !== 'string') {
      return false
    }
  }
  return true
}

function readTokenMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LIKE_TOKENS_KEY)
    if (!raw) {
      return {}
    }
    const parsed: unknown = JSON.parse(raw)
    if (isRecordOfStrings(parsed)) {
      return parsed
    }
  } catch {
    // Corrupt data — reset.
  }
  return {}
}

function readLikeToken(permalink: string): string | null {
  return readTokenMap()[permalink] ?? null
}

function writeLikeToken(permalink: string, token: string): void {
  const map = readTokenMap()
  map[permalink] = token
  localStorage.setItem(LIKE_TOKENS_KEY, JSON.stringify(map))
}

function removeLikeToken(permalink: string): void {
  const map = readTokenMap()
  delete map[permalink]
  localStorage.setItem(LIKE_TOKENS_KEY, JSON.stringify(map))
}

export interface LikeButtonState {
  /** Mirrors the API wire `key` — the metric's public UUID. */
  commentKey: string
  likes: number
  liked: boolean
}

export function createLikeButtonState(commentKey: string, likes: number): LikeButtonState {
  return { commentKey, likes, liked: false }
}

/** Apply an optimistic like/unlike toggle. Exported for unit tests. */
export function applyLikeOptimistic(state: LikeButtonState, action: 'like' | 'unlike'): LikeButtonState {
  if (action === 'like') {
    return { ...state, liked: true, likes: state.likes + 1 }
  }
  return { ...state, liked: false, likes: Math.max(0, state.likes - 1) }
}

export function LikeButton({ permalink, commentKey, likes: initialLikes }: LikeButtonProps) {
  // `useOptimistic` must be dispatched inside a transition and stay pending
  // until `onSuccess` commits, otherwise React 19 reverts the update.
  const [baseState, setBaseState] = useState(createLikeButtonState(commentKey, initialLikes))
  const [state, addOptimistic] = useOptimistic(baseState, applyLikeOptimistic)

  // `@number-flow/react` renders a nested span structure (digit rolls) that
  // a static fallback cannot replicate, so rendering it during hydration
  // would mismatch the server's plain-number span (React error #418). The
  // official hydration-safe client-only switch: SSR and the first hydrated
  // render take the server snapshot (plain span); right after hydration the
  // store re-checks and flips to NumberFlow — a regular update with no
  // hydration constraints, and the lazy chunk can still arrive late under
  // the Suspense fallback.
  const showNumberFlow = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )

  const tokenRef = useRef<string | null>(null)
  // Interaction sequencing: every like/unlike dispatch bumps
  // `interactionSeqRef`, and a validate request snapshots it on the way
  // out. If the user interacted while the request was in flight, the
  // verdict predates the current state and is discarded — it must not
  // flip the button back or delete the freshly issued token.
  const interactionSeqRef = useRef(0)
  const validateSeqRef = useRef(0)

  const validate = useMutation({
    ...orpcQuery.likes.validate.mutationOptions(),
    onSuccess: (data: ValidateLikeTokenOutput) => {
      if (validateSeqRef.current !== interactionSeqRef.current) {
        return
      }
      setBaseState((prev) => (data.key === prev.commentKey ? { ...prev, liked: data.valid } : prev))
      if (data.valid) {
        const stored = readLikeToken(permalink)
        if (stored) {
          tokenRef.current = stored
        }
      } else {
        tokenRef.current = null
        removeLikeToken(permalink)
      }
    },
  })

  const increase = useMutation({
    ...orpcQuery.likes.increase.mutationOptions(),
    onSuccess: (data: IncreaseLikeOutput) => {
      setBaseState((prev) => (data.key === prev.commentKey ? { ...prev, liked: true, likes: data.likes } : prev))
      if (data.token) {
        tokenRef.current = data.token
        try {
          writeLikeToken(permalink, data.token)
        } catch {
          // localStorage full or unavailable — the ref still holds the token
          // so the unlike toggle works for the lifetime of this component.
        }
      }
    },
  })

  const decrease = useMutation({
    ...orpcQuery.likes.decrease.mutationOptions(),
    onSuccess: (data: DecreaseLikeOutput) => {
      setBaseState((prev) => (data.key === prev.commentKey ? { ...prev, liked: false, likes: data.likes } : prev))
      tokenRef.current = null
      removeLikeToken(permalink)
    },
  })

  // Reset state when navigating between detail routes (same component instance).
  const validateMutate = validate.mutate
  const [lastPermalink, setLastPermalink] = useState(permalink)
  if (permalink !== lastPermalink) {
    setLastPermalink(permalink)
    setBaseState(createLikeButtonState(commentKey, initialLikes))
  }
  useEffect(() => {
    const token = readLikeToken(permalink)
    if (!token) {
      tokenRef.current = null
      return
    }
    tokenRef.current = token
    validateSeqRef.current = interactionSeqRef.current
    validateMutate({ key: commentKey, token })
    // Re-validate when permalink changes; identity-stable refs only.
  }, [permalink, commentKey, validateMutate])

  const isPending = increase.isPending || decrease.isPending
  const increaseMutateAsync = increase.mutateAsync
  const decreaseMutateAsync = decrease.mutateAsync

  const onClick = useCallback(() => {
    if (isPending) {
      return
    }

    if (state.liked) {
      const token = tokenRef.current ?? readLikeToken(permalink)
      if (!token) {
        return
      }
      interactionSeqRef.current += 1
      startTransition(async () => {
        addOptimistic('unlike')
        try {
          await decreaseMutateAsync({ key: commentKey, token })
        } catch {
          // Rejected (e.g. the server found the token already consumed):
          // React Query records the error and the optimistic toggle
          // reverts with the transition — no base state was committed.
        }
      })
    } else {
      interactionSeqRef.current += 1
      startTransition(async () => {
        addOptimistic('like')
        try {
          await increaseMutateAsync({ key: commentKey })
        } catch {
          // Same contract as the unlike path (e.g. rate-limited).
        }
      })
    }
  }, [isPending, state.liked, permalink, addOptimistic, decreaseMutateAsync, increaseMutateAsync, commentKey])

  return (
    <div className="mt-12 text-center">
      <Button
        variant="dark"
        size="lg"
        shape="pill"
        className={cn(
          'px-10',
          'border-like-bg bg-like-bg hover:border-like-bg-hover hover:bg-like-bg-hover',
          // Lift on hover: soft shadow + 4% scale-up. Transition respects
          // prefers-reduced-motion via the base.css media-query guard.
          'transition-[transform,box-shadow,background-color,border-color] duration-200 ease-[cubic-bezier(0.175,0.885,0.32,1.1)] hover:scale-[1.04] hover:shadow-[0_12px_32px_-6px_rgb(0_0_0/0.25)]',
          'data-[liked=true]:border-like-active data-[liked=true]:bg-like-active data-[liked=true]:text-white data-[liked=true]:shadow-like-active',
        )}
        title="Do you like me?"
        aria-pressed={state.liked}
        aria-label={state.liked ? '取消点赞' : '点赞'}
        data-liked={state.liked ? 'true' : 'false'}
        onClick={onClick}
        disabled={isPending}
      >
        <HeartIcon
          className="me-1 mt-[-2px] size-[1.1em] align-middle"
          fill="currentColor"
          size="1em"
          strokeWidth={0}
          aria-hidden
        />
        {showNumberFlow ? (
          <Suspense fallback={<span>{state.likes}</span>}>
            <NumberFlow value={state.likes} />
          </Suspense>
        ) : (
          <span>{state.likes}</span>
        )}
      </Button>
    </div>
  )
}

export interface LikeShareProps {
  post: {
    title: string
    summary: string
    cover: string
    permalink: string
  }
}

export function LikeShare({ post }: LikeShareProps) {
  const { website } = useSiteIdentity()
  const postURL = joinUrl(website, post.permalink)
  const qq = new URLSearchParams({
    url: postURL,
    pics: post.cover,
    summary: post.summary,
  }).toString()
  const weibo = new URLSearchParams({
    url: postURL,
    type: 'button',
    language: 'zh_cn',
    pic: post.cover,
    searchPic: 'true',
    title: `【${post.title}】${post.summary}`,
  }).toString()

  return (
    <div className="mt-6 text-center">
      <Button
        variant="light"
        size="iconMd"
        shape="circle"
        className="mx-1"
        render={<a href={`https://connect.qq.com/widget/shareqq/index.html?${qq}`} aria-label="分享到 QQ 空间" />}
        title="分享到 QQ 空间"
      >
        <IconButtonContent>
          <QQIcon className="size-5" />
        </IconButtonContent>
      </Button>
      <QRDialog
        url={postURL}
        name="在微信中请长按二维码"
        title="微信扫一扫 分享朋友圈"
        trigger={<WechatIcon className="size-5" />}
        variant="light"
        size="iconMd"
        shape="circle"
        className="mx-1"
      />
      <Button
        variant="light"
        size="iconMd"
        shape="circle"
        className="mx-1"
        render={<a href={`https://service.weibo.com/share/share.php?${weibo}`} aria-label="分享到微博" />}
        title="分享到微博"
      >
        <IconButtonContent>
          <WeiboIcon className="size-5" />
        </IconButtonContent>
      </Button>
    </div>
  )
}
