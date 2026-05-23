import { HeartIcon } from 'lucide-react'
import { startTransition, useEffect, useOptimistic, useState } from 'react'

import type { DecreaseLikeOutput, IncreaseLikeOutput, ValidateLikeTokenOutput } from '@/shared/types/likes'

import { useMutation, orpcQuery } from '@/client/api/query'
import { joinUrl } from '@/shared/utils/urls'
import { Button } from '@/ui/components/button'
import { IconButtonContent } from '@/ui/components/icon-button-content'
import { QQIcon, WechatIcon, WeiboIcon } from '@/ui/icons/brand-social-icons'
import { useSiteIdentity } from '@/ui/lib/blog-config-context'
import { cn } from '@/ui/lib/cn'
import { QRDialog } from '@/ui/public/widgets/QRDialog'

export interface LikeButtonProps {
  /** Stable URL — used as the `localStorage` namespace for the like token. */
  permalink: string
  /** Metric `public_id` UUID — the wire key the like API actions expect. */
  commentKey: string
  likes: number
}

const tokenStorageKey = (permalink: string): string => permalink

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

  const validate = useMutation({
    ...orpcQuery.likes.validate.mutationOptions(),
    onSuccess: (data: ValidateLikeTokenOutput) => {
      setBaseState((prev) => (data.key === prev.commentKey ? { ...prev, liked: data.valid } : prev))
      if (!data.valid) {
        localStorage.removeItem(tokenStorageKey(permalink))
      }
    },
  })

  const increase = useMutation({
    ...orpcQuery.likes.increase.mutationOptions(),
    onSuccess: (data: IncreaseLikeOutput) => {
      setBaseState((prev) => (data.key === prev.commentKey ? { ...prev, liked: true, likes: data.likes } : prev))
      if (data.token) {
        localStorage.setItem(tokenStorageKey(permalink), data.token)
      }
    },
  })

  const decrease = useMutation({
    ...orpcQuery.likes.decrease.mutationOptions(),
    onSuccess: (data: DecreaseLikeOutput) => {
      setBaseState((prev) => (data.key === prev.commentKey ? { ...prev, liked: false, likes: data.likes } : prev))
      localStorage.removeItem(tokenStorageKey(permalink))
    },
  })

  // Sync local island state to React Router loader data. Detail routes reuse
  // the same component instance when navigating `/posts/a` -> `/posts/b`, so
  // both the counter and local "liked" flag must be reset before validating
  // the new page's cached token.
  const validateMutate = validate.mutate

  useEffect(() => {
    setBaseState(createLikeButtonState(commentKey, initialLikes))
    const token = localStorage.getItem(tokenStorageKey(permalink))
    if (!token) {
      return
    }
    validateMutate({ key: commentKey, token })
  }, [permalink, commentKey, initialLikes, validateMutate])

  const isPending = increase.isPending || decrease.isPending
  const increaseMutateAsync = increase.mutateAsync
  const decreaseMutateAsync = decrease.mutateAsync

  const onClick = () => {
    if (isPending) {
      return
    }

    // The optimistic dispatch only survives while a transition is pending,
    // so we open one here and let it stay pending until `submitAsync`
    // resolves — see the contract comment above the hook calls.
    if (state.liked) {
      const token = localStorage.getItem(tokenStorageKey(permalink))
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
  }

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
        <span className="inline-block align-middle">{state.likes}</span>
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
