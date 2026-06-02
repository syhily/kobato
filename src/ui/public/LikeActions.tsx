import { HeartIcon } from 'lucide-react'
import { startTransition, useCallback, useEffect, useOptimistic, useRef, useState } from 'react'

import type { DecreaseLikeOutput, IncreaseLikeOutput, ValidateLikeTokenOutput } from '@/shared/types/likes'

import { useMutation, orpcQuery } from '@/client/api/query'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { joinUrl } from '@/shared/utils/urls'
import { Button } from '@/ui/components/button'
import { IconButtonContent } from '@/ui/components/icon-button-content'
import { NumberFlow } from '@/ui/components/number-flow'
import { QQIcon, WechatIcon, WeiboIcon } from '@/ui/icons/brand-social-icons'
import { cn } from '@/ui/lib/cn'
import { QRDialog } from '@/ui/public/widgets/QRDialog'

export interface LikeButtonProps {
  /** Stable URL — used as the `localStorage` namespace for the like token. */
  permalink: string
  /** Metric `public_id` UUID — the wire key the like API actions expect. */
  commentKey: string
  likes: number
}

// Single localStorage key holding a JSON map of permalink → token.
// One key per post was hitting the per-domain item limit; a single
// key stays under the limit regardless of how many posts get liked.
const LIKE_TOKENS_KEY = 'like-tokens'

function readTokenMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LIKE_TOKENS_KEY)
    if (!raw) {
      return {}
    }
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, string>
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

// React 19 client island: replaces the imperative
// `src/assets/scripts/features/like-button.ts` glue. The button hydrates on
// the post / page detail pages, validates any cached like token in
// `localStorage`, and uses one `useMutation` per direction so the SSR
// HTML (count / heart) stays the source of truth on first paint.
export function LikeButton({ permalink, commentKey, likes: initialLikes }: LikeButtonProps) {
  // baseState is the server-confirmed view. `useOptimistic` layers the
  // pending toggle on top of it for the duration of the in-flight transition
  // so the heart and counter flip the instant the user clicks.
  //
  // Contract that makes this work: `addOptimistic` MUST be dispatched
  // inside a transition (React 19 reverts the update on the next render
  // otherwise, which used to manifest as "the click does nothing"), and the
  // transition MUST stay pending until `onSuccess` has committed the
  // confirmed `baseState`. We achieve both by wrapping the dispatch in
  // `startTransition(async () => { … })` and awaiting `submit`, whose
  // returned promise resolves only after React Router finishes revalidation
  // — by which point the `useFetcherResult` effect has already drained
  // `fetcher.data` and called `onSuccess`, so `baseState` already matches
  // the optimistic value and the transition can end without a flicker.
  //
  // Wire-vs-storage key split: the like API actions key off the metric's
  // `public_id` UUID (`commentKey`), but the local like-token cache is
  // keyed off the URL (`permalink`) so it survives DB id churn between
  // deployments. Confuse the two and `findMetricByPublicId` 404s the
  // permalink string — that was the original bug surfaced by clicking
  // the heart.
  const [baseState, setBaseState] = useState(createLikeButtonState(commentKey, initialLikes))
  const [state, addOptimistic] = useOptimistic(baseState, applyLikeOptimistic)

  // Hold the active like token in a ref so the unlike action doesn't depend
  // solely on localStorage (which can fail silently due to quota, private
  // browsing, or storage APIs being unavailable).
  const tokenRef = useRef<string | null>(null)

  const validate = useMutation({
    ...orpcQuery.likes.validate.mutationOptions(),
    onSuccess: (data: ValidateLikeTokenOutput) => {
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

  // Sync local island state to React Router loader data. Detail routes reuse
  // the same component instance when navigating `/posts/a` -> `/posts/b`, so
  // both the counter and local "liked" flag must be reset before validating
  // the new page's cached token.
  const validateMutate = validate.mutate

  useEffect(() => {
    setBaseState(createLikeButtonState(commentKey, initialLikes))
    const token = readLikeToken(permalink)
    if (!token) {
      tokenRef.current = null
      return
    }
    tokenRef.current = token
    validateMutate({ key: commentKey, token })
  }, [permalink, commentKey, initialLikes, validateMutate])

  const isPending = increase.isPending || decrease.isPending
  const increaseMutateAsync = increase.mutateAsync
  const decreaseMutateAsync = decrease.mutateAsync

  const onClick = useCallback(() => {
    if (isPending) {
      return
    }

    // The optimistic dispatch only survives while a transition is pending,
    // so we open one here and let it stay pending until `submitAsync`
    // resolves — see the contract comment above the hook calls.
    if (state.liked) {
      // Prefer the in-memory ref (always available after a successful
      // increase); fall back to the mapped localStorage for tokens that
      // survived a page refresh via the validate path in useEffect.
      const token = tokenRef.current ?? readLikeToken(permalink)
      if (!token) {
        return
      }
      startTransition(async () => {
        addOptimistic('unlike')
        await decreaseMutateAsync({ key: commentKey, token })
      })
    } else {
      startTransition(async () => {
        addOptimistic('like')
        await increaseMutateAsync({ key: commentKey })
      })
    }
  }, [isPending, state.liked, permalink, addOptimistic, decreaseMutateAsync, increaseMutateAsync, commentKey])

  return (
    <div className="mt-12 text-center">
      <Button
        variant="dark"
        size="lg"
        shape="pill"
        // - `px-10` widens the pill horizontally to match the
        //   legacy `padding-inline: 2.5rem` from the post-like rule.
        // - `data-[liked=true]:…` swaps the chrome to the red
        //   like-active state when the post is liked. The
        //   `[data-liked=true]` attribute selector adds 1 to
        //   selector specificity, so the data-state utilities
        //   win over the unconditional colourway by
        //   specificity at runtime.
        className={cn(
          'px-10',
          // Resting state rides the dedicated `--like-bg` token so dark
          // mode can swap the brand navy for a grayish light blue without
          // affecting every other `variant="dark"` button on the site.
          'border-like-bg bg-like-bg hover:border-like-bg-hover hover:bg-like-bg-hover',
          'hover:animate-shake hover:will-change-transform',
          'data-[liked=true]:border-like-active data-[liked=true]:bg-like-active data-[liked=true]:text-white data-[liked=true]:shadow-like-active',
        )}
        title="Do you like me?"
        data-permalink={permalink}
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
        <NumberFlow value={state.likes} />
      </Button>
    </div>
  )
}

// Only the four fields the social-share intents need. Keeps the prop
// boundary loose so detail/listing projections don't have to widen here.
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
          <QQIcon className="m-icon-inset" />
        </IconButtonContent>
      </Button>
      <QRDialog
        url={postURL}
        name="在微信中请长按二维码"
        title="微信扫一扫 分享朋友圈"
        trigger={<WechatIcon className="m-icon-inset" />}
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
          <WeiboIcon className="m-icon-inset" />
        </IconButtonContent>
      </Button>
    </div>
  )
}
