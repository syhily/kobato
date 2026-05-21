import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import type { CommentItemWire as CommentItemType } from '@/shared/contracts/comments'
import type { CommentFormUser } from '@/shared/types/catalog'
import type {
  Comments as CommentsData,
  LoadCommentsInput,
  LoadCommentsOutput,
  MyCommentsOutput,
} from '@/shared/types/comments'

import { useMutation, orpcQuery } from '@/client/api/query'
import { Button } from '@/ui/components/button'
import { useCommentsSettings } from '@/ui/lib/blog-config-context'
import { CommentItem } from '@/ui/public/comments/comment-item/CommentItem'
import { CommentReplyForm } from '@/ui/public/comments/CommentReplyForm'
import {
  CommentsContext,
  type CommentsContextValue,
  type CommentTreeAction,
  type CommentTreeState,
  useCommentsContext,
} from '@/ui/public/comments/comments-context'

export interface CommentsProps {
  commentKey: string
  /** CSRF token for `replyComment` (must match `csrf-token` cookie). Rotates after each successful reply. */
  csrfToken: string
  comments: CommentsData | null
  items: CommentItemType[]
  user?: CommentFormUser
}

function asKey(value: bigint | string | number): string {
  return String(value)
}

// Replace a comment by id anywhere in the tree (root or nested).
function mapTree(items: CommentItemType[], fn: (item: CommentItemType) => CommentItemType): CommentItemType[] {
  return items.map((item) => {
    const next = fn(item)
    if (next.children && next.children.length > 0) {
      const children = mapTree(next.children, fn)
      return children === next.children ? next : { ...next, children }
    }
    return next
  })
}

function filterTree(items: CommentItemType[], predicate: (item: CommentItemType) => boolean): CommentItemType[] {
  return items.filter(predicate).map((item) => {
    if (item.children && item.children.length > 0) {
      return { ...item, children: filterTree(item.children, predicate) }
    }
    return item
  })
}

function reducer(state: CommentTreeState, action: CommentTreeAction): CommentTreeState {
  switch (action.type) {
    case 'reset':
      return {
        items: action.items,
        rootsTotal: action.rootsTotal,
        rootsLoaded: action.rootsLoaded,
        replyToId: 0,
      }
    case 'append':
      return {
        ...state,
        items: [...state.items, ...action.items],
        rootsLoaded: action.rootsLoaded,
      }
    case 'insertReply': {
      if (action.rid === 0) {
        return {
          ...state,
          items: [action.comment, ...state.items],
          rootsTotal: state.rootsTotal + 1,
          rootsLoaded: state.rootsLoaded + 1,
        }
      }
      const ridKey = asKey(action.rid)
      const items = mapTree(state.items, (item) => {
        if (asKey(item.id) !== ridKey) {
          return item
        }
        const children = item.children ?? []
        return { ...item, children: [...children, action.comment] }
      })
      return { ...state, items }
    }
    case 'updateComment': {
      const id = asKey(action.comment.id)
      const items = mapTree(state.items, (item) => {
        if (asKey(item.id) !== id) {
          return item
        }
        // Preserve existing children (the edit endpoint returns the comment
        // shape without its descendants).
        const children = item.children
        return { ...action.comment, children }
      })
      return { ...state, items }
    }
    case 'removeComment': {
      const id = asKey(action.id)
      const items = filterTree(state.items, (item) => asKey(item.id) !== id)
      return { ...state, items }
    }
    case 'approveComment': {
      const id = asKey(action.id)
      const items = mapTree(state.items, (item) => {
        if (asKey(item.id) !== id) {
          return item
        }
        return { ...item, isPending: false }
      })
      return { ...state, items }
    }
    case 'setReplyTo':
      return { ...state, replyToId: action.rid }
    case 'mergeMyComments': {
      const incomingIds = new Set(action.comments.map((c) => asKey(c.id)))
      // 1) Update any comments that already exist in the tree.
      let items = mapTree(state.items, (item) => {
        if (!incomingIds.has(asKey(item.id))) {
          return item
        }
        const replacement = action.comments.find((c) => asKey(c.id) === asKey(item.id))!
        return { ...replacement, children: item.children }
      })
      // 2) Insert brand-new comments.
      // Root comments from myComments are pinned to the top so pending
      // posts are immediately visible; children stay anchored under parent.
      const newRoots: CommentItemType[] = []
      const newChildren: CommentItemType[] = []
      for (const c of action.comments) {
        if (findComment(items, Number(c.id))) {
          continue
        }
        if (c.rid === 0 || c.rid === null || c.rid === undefined) {
          newRoots.push(c)
        } else {
          newChildren.push(c)
        }
      }
      items = [...newRoots, ...items]
      for (const c of newChildren) {
        items = mapTree(items, (item) => {
          if (asKey(item.id) !== asKey(c.rid)) {
            return item
          }
          const children = item.children ?? []
          return { ...item, children: [...children, c] }
        })
      }
      return { ...state, items }
    }
  }
}

export function createCommentTreeState(items: CommentItemType[], rootsCount: number): CommentTreeState {
  return {
    items,
    rootsLoaded: Math.min(items.length, rootsCount),
    rootsTotal: rootsCount,
    replyToId: 0,
  }
}

export const commentTreeReducer = reducer

// Public entry. Validates the loader payload and otherwise delegates to the
// orchestrator (`CommentsRoot`) + compound subcomponents
// (`Comments.Header`, `Comments.ReplyFormSlot`, `Comments.List`,
// `Comments.LoadMore`). Leaf components consume the shared
// `CommentsContext` instead of accepting render-prop callbacks.
export function Comments({ commentKey, csrfToken: initialCsrfToken, comments, items, user }: CommentsProps) {
  if (comments == null) {
    return (
      <div id="comments" className="pt-12">
        评论加载失败 ❌
      </div>
    )
  }

  return (
    <CommentsRoot
      key={commentKey}
      commentKey={commentKey}
      initialCsrfToken={initialCsrfToken}
      initialItems={items}
      rootsCount={comments.roots_count}
      totalCount={comments.count}
      user={user}
    >
      <Comments.Header />
      <Comments.ReplyFormSlot />
      <Comments.List />
      <Comments.LoadMore />
    </CommentsRoot>
  )
}

interface CommentsRootProps {
  commentKey: string
  initialCsrfToken: string
  initialItems: CommentItemType[]
  rootsCount: number
  totalCount: number
  user?: CommentFormUser
  children: React.ReactNode
}

function CommentsRoot({
  commentKey,
  initialCsrfToken,
  initialItems,
  rootsCount,
  totalCount,
  user,
  children,
}: CommentsRootProps) {
  const [state, dispatch] = useReducer(reducer, createCommentTreeState(initialItems, rootsCount))
  const [csrfToken, setCsrfToken] = useState(initialCsrfToken)
  useEffect(() => {
    setCsrfToken(initialCsrfToken)
  }, [initialCsrfToken])

  // Scroll the reply form into view after a Reply click. The Tiptap
  // editor inside the form auto-focuses on mount; we just need to
  // surface its container so the operator sees the staged reply box.
  const focusReplyForm = useCallback(() => {
    if (typeof document === 'undefined') {
      return
    }
    const respond = document.getElementById('respond')
    respond?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const editable = respond?.querySelector<HTMLElement>('[contenteditable="true"]')
    editable?.focus({ preventScroll: true })
  }, [])

  const onReply = useCallback(
    (rid: number) => {
      flushSync(() => {
        dispatch({ type: 'setReplyTo', rid })
      })
      focusReplyForm()
    },
    [focusReplyForm],
  )
  const onCancelReply = useCallback(() => dispatch({ type: 'setReplyTo', rid: 0 }), [])
  const onEdited = useCallback((comment: CommentItemType) => dispatch({ type: 'updateComment', comment }), [])
  const onApproved = useCallback((id: bigint | string) => dispatch({ type: 'approveComment', id }), [])
  const onDeleted = useCallback((id: bigint | string) => dispatch({ type: 'removeComment', id }), [])
  const revokeToken = useMutation({
    ...orpcQuery.comments.revokeToken.mutationOptions(),
  })
  const onDismissMyComment = useCallback(
    (id: bigint | string) => {
      const key = asKey(id)
      revokeToken.mutate({ rid: key })
      setMyCommentIds((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
      setMyCommentExpiresAt((prev) => {
        const next = new Map(prev)
        next.delete(key)
        return next
      })
    },
    [revokeToken],
  )
  const onReplied = useCallback((comment: CommentItemType, rid: number) => {
    dispatch({ type: 'insertReply', comment, rid })
    dispatch({ type: 'setReplyTo', rid: 0 })
  }, [])

  const admin = user?.admin === true
  const replyTarget = state.replyToId === 0 ? undefined : findComment(state.items, state.replyToId)
  const activeReplyToId = replyTarget ? state.replyToId : 0

  // Load the current user's own comments (including pending) via token cookie.
  const [myCommentIds, setMyCommentIds] = useState<Set<string>>(new Set())
  const [myCommentExpiresAt, setMyCommentExpiresAt] = useState<Map<string, number>>(new Map())
  const myComments = useMutation({
    ...orpcQuery.comments.myComments.mutationOptions(),
    onSuccess: (payload: MyCommentsOutput) => {
      if (payload.comments.length > 0) {
        dispatch({ type: 'mergeMyComments', comments: payload.comments, expiresAt: payload.expiresAt })
        setMyCommentIds(new Set(payload.comments.map((c) => asKey(c.id))))
        setMyCommentExpiresAt(new Map(Object.entries(payload.expiresAt)))
      }
    },
  })

  useEffect(() => {
    if (!admin && !user) {
      myComments.mutate({ page_key: commentKey })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentKey, admin, user])

  // The same reply form JSX flows through context to whichever depth
  // currently owns it (top-level or nested under the active comment).
  const replyForm = useMemo(
    () => (
      <CommentReplyForm
        commentKey={commentKey}
        csrfToken={csrfToken}
        onCsrfRotated={setCsrfToken}
        replyToId={activeReplyToId}
        replyTarget={replyTarget}
        user={user}
        onCancel={onCancelReply}
        onReplied={onReplied}
      />
    ),
    [commentKey, csrfToken, setCsrfToken, activeReplyToId, replyTarget, user, onCancelReply, onReplied],
  )

  const value = useMemo<CommentsContextValue>(
    () => ({
      commentKey,
      totalCount,
      admin,
      user,
      state,
      activeReplyToId,
      myCommentIds,
      myCommentExpiresAt,
      currentUserId: user?.id != null ? String(user.id) : null,
      onReply,
      onCancelReply,
      onEdited,
      onApproved,
      onDeleted,
      onDismissMyComment,
      dispatch,
      replyForm,
    }),
    [
      commentKey,
      totalCount,
      admin,
      user,
      state,
      activeReplyToId,
      myCommentIds,
      myCommentExpiresAt,
      onReply,
      onCancelReply,
      onEdited,
      onApproved,
      onDeleted,
      onDismissMyComment,
      dispatch,
      replyForm,
    ],
  )

  return (
    <CommentsContext.Provider value={value}>
      <div id="comments" className="pt-12">
        {children}
      </div>
    </CommentsContext.Provider>
  )
}

function CommentsHeader() {
  const ctx = useCommentsContext('Comments.Header')
  return (
    <div className="mb-6 text-xl leading-[1.4] font-semibold">
      评论 <small className="font-theme text-sm">({ctx.totalCount})</small>
    </div>
  )
}

// Renders the reply form only when no comment is the active reply target —
// i.e. the top-level "Leave a reply" position. Reply forms anchored under a
// specific comment travel through the recursive `CommentItem` tree.
function CommentsReplyFormSlot() {
  const ctx = useCommentsContext('Comments.ReplyFormSlot')
  if (ctx.activeReplyToId !== 0) {
    return null
  }
  return <>{ctx.replyForm}</>
}

function CommentsList() {
  const ctx = useCommentsContext('Comments.List')
  return (
    <ul className="comment-list">
      {ctx.state.items.map((item) => (
        <CommentItem key={asKey(item.id)} comment={item} depth={1} />
      ))}
    </ul>
  )
}

function CommentsLoadMore() {
  const ctx = useCommentsContext('Comments.LoadMore')
  const { comments } = useCommentsSettings()
  const pageSize = comments.size

  // Pin the latest `rootsLoaded` so the success callback can compute the
  // new offset without forcing the hook to remount on every dispatch.
  const rootsLoadedRef = useRef(ctx.state.rootsLoaded)
  rootsLoadedRef.current = ctx.state.rootsLoaded

  const loadMore = useMutation({
    ...orpcQuery.comments.loadComments.mutationOptions(),
    onSuccess: (payload: LoadCommentsOutput) => {
      ctx.dispatch({
        type: 'append',
        items: payload.comments,
        rootsLoaded: rootsLoadedRef.current + payload.comments.length,
      })
    },
  })

  if (ctx.state.rootsLoaded >= ctx.state.rootsTotal) {
    return null
  }

  const moreLoading = loadMore.isPending
  const onLoadMore = () => {
    if (loadMore.isPending) {
      return
    }
    loadMore.mutate({
      page_key: ctx.commentKey,
      offset: ctx.state.rootsLoaded,
    } satisfies LoadCommentsInput)
  }

  return (
    <div className="mt-4 text-center md:mt-6">
      <Button
        variant="light"
        onClick={onLoadMore}
        disabled={moreLoading}
        data-key={ctx.commentKey}
        data-size={pageSize}
        data-offset={ctx.state.rootsLoaded}
      >
        {moreLoading ? '加载中...' : '加载更多'}
      </Button>
    </div>
  )
}

function findComment(items: CommentItemType[], rid: number): CommentItemType | undefined {
  const target = asKey(rid)
  for (const item of items) {
    if (asKey(item.id) === target) {
      return item
    }
    if (item.children && item.children.length > 0) {
      const inner = findComment(item.children, rid)
      if (inner) {
        return inner
      }
    }
  }
  return undefined
}

Comments.Header = CommentsHeader
Comments.ReplyFormSlot = CommentsReplyFormSlot
Comments.List = CommentsList
Comments.LoadMore = CommentsLoadMore

export type { CommentTreeAction, CommentTreeState }
