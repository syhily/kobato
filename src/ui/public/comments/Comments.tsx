import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { flushSync } from 'react-dom'

import type { CommentItemWire as CommentItemType } from '@/shared/contracts/comments'
import type { CommentFormUser } from '@/shared/types/catalog'
import type {
  Comments as CommentsData,
  LoadCommentsInput,
  LoadCommentsOutput,
  MyCommentsOutput,
} from '@/shared/types/comments'

import { orpcQuery } from '@/client/api/orpc-query'
import { Button } from '@/ui/components/button'
import { CommentItem } from '@/ui/public/comments/comment-item/CommentItem'
import { CommentReplyForm } from '@/ui/public/comments/CommentReplyForm'
import {
  CommentsActionsContext,
  CommentsIdentityContext,
  CommentsReplySlotContext,
  CommentsTreeContext,
  type CommentTreeAction,
  type CommentTreeState,
  useCommentsActions,
  useCommentsReplySlot,
  useCommentsTree,
} from '@/ui/public/comments/comments-context'

export interface CommentsProps {
  commentKey: string
  comments: CommentsData | null
  items: CommentItemType[]
  user?: CommentFormUser
}

function asKey(value: number | string): string {
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
        myComments: new Map(),
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
      // 2) Insert brand-new comments: new roots pin to the top so pending
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
      // 3) Fold token ownership into the same dispatch so tree and ownership map land atomically.
      const myComments = new Map(state.myComments)
      for (const c of action.comments) {
        const key = asKey(c.id)
        myComments.set(key, { expiresAt: action.expiresAt[key] })
      }
      return { ...state, items, myComments }
    }
    case 'dismissMyComment': {
      if (!state.myComments.has(action.id)) {
        return state
      }
      const myComments = new Map(state.myComments)
      myComments.delete(action.id)
      return { ...state, myComments }
    }
  }
}

function createCommentTreeState(items: CommentItemType[], rootsCount: number): CommentTreeState {
  return {
    items,
    rootsLoaded: Math.min(items.length, rootsCount),
    rootsTotal: rootsCount,
    replyToId: 0,
    myComments: new Map(),
  }
}

export function Comments({ commentKey, comments, items, user }: CommentsProps) {
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
  initialItems: CommentItemType[]
  rootsCount: number
  totalCount: number
  user?: CommentFormUser
  children: React.ReactNode
}

function CommentsRoot({ commentKey, initialItems, rootsCount, totalCount, user, children }: CommentsRootProps) {
  const [state, dispatch] = useReducer(reducer, createCommentTreeState(initialItems, rootsCount))

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
  const onApproved = useCallback((id: number | string) => dispatch({ type: 'approveComment', id }), [])
  const onDeleted = useCallback((id: number | string) => dispatch({ type: 'removeComment', id }), [])
  const { mutate: revokeToken } = useMutation({
    ...orpcQuery.comments.revokeToken.mutationOptions(),
  })

  const admin = user?.admin === true
  const currentUserId = user?.id != null ? String(user.id) : null
  const replyTarget = state.replyToId === 0 ? undefined : findComment(state.items, state.replyToId)
  const activeReplyToId = replyTarget ? state.replyToId : 0

  const onDismissMyComment = useCallback(
    (id: number | string) => {
      const key = asKey(id)
      revokeToken({ rid: key })
      dispatch({ type: 'dismissMyComment', id: key })
    },
    [revokeToken],
  )
  const onReplied = useCallback((comment: CommentItemType, rid: number) => {
    dispatch({ type: 'insertReply', comment, rid })
    dispatch({ type: 'setReplyTo', rid: 0 })
  }, [])
  // Load the current user's own comments (including pending) via token cookie;
  // one dispatch folds in both the tree entries and the ownership map.
  const myComments = useMutation({
    ...orpcQuery.comments.myComments.mutationOptions(),
    onSuccess: (payload: MyCommentsOutput) => {
      if (payload.comments.length > 0) {
        dispatch({
          type: 'mergeMyComments',
          comments: payload.comments,
          expiresAt: payload.expiresAt,
        })
      }
    },
  })

  const { mutate: loadMyComments } = myComments
  useEffect(() => {
    if (!admin && !user) {
      loadMyComments({ page_key: commentKey })
    }
  }, [commentKey, admin, user, loadMyComments])

  const replyForm = useMemo(
    () => (
      <CommentReplyForm
        commentKey={commentKey}
        replyToId={activeReplyToId}
        replyTarget={replyTarget}
        user={user}
        onCancel={onCancelReply}
        onReplied={onReplied}
      />
    ),
    [commentKey, activeReplyToId, replyTarget, user, onCancelReply, onReplied],
  )

  const treeValue = useMemo(() => ({ commentKey, totalCount, state }), [commentKey, totalCount, state])

  const identityValue = useMemo(
    () => ({ admin, currentUserId, myComments: state.myComments }),
    [admin, currentUserId, state.myComments],
  )

  const slotValue = useMemo(() => ({ activeReplyToId, replyForm }), [activeReplyToId, replyForm])

  const actionsValue = useMemo(
    () => ({
      onReply,
      onCancelReply,
      onEdited,
      onApproved,
      onDeleted,
      onDismissMyComment,
      dispatch,
    }),
    [onReply, onCancelReply, onEdited, onApproved, onDeleted, onDismissMyComment, dispatch],
  )

  return (
    <CommentsTreeContext value={treeValue}>
      <CommentsIdentityContext value={identityValue}>
        <CommentsReplySlotContext value={slotValue}>
          <CommentsActionsContext value={actionsValue}>
            <div id="comments" className="pt-12">
              {children}
            </div>
          </CommentsActionsContext>
        </CommentsReplySlotContext>
      </CommentsIdentityContext>
    </CommentsTreeContext>
  )
}

function CommentsHeader() {
  const { totalCount } = useCommentsTree('Comments.Header')
  return (
    <div className="mb-6 text-xl leading-body font-semibold">
      评论 <small className="font-theme text-sm">({totalCount})</small>
    </div>
  )
}

function CommentsReplyFormSlot() {
  const { activeReplyToId, replyForm } = useCommentsReplySlot('Comments.ReplyFormSlot')
  if (activeReplyToId !== 0) {
    return null
  }
  return <>{replyForm}</>
}

function CommentsList() {
  const { state } = useCommentsTree('Comments.List')
  return (
    <ul className="comment-list">
      {state.items.map((item) => (
        <CommentItem key={asKey(item.id)} comment={item} depth={1} />
      ))}
    </ul>
  )
}

function CommentsLoadMore() {
  const { commentKey, state } = useCommentsTree('Comments.LoadMore')
  const actions = useCommentsActions('Comments.LoadMore')

  const rootsLoadedRef = useRef(state.rootsLoaded)
  useEffect(() => {
    rootsLoadedRef.current = state.rootsLoaded
  })

  const loadMore = useMutation({
    ...orpcQuery.comments.loadComments.mutationOptions(),
    onSuccess: (payload: LoadCommentsOutput) => {
      actions.dispatch({
        type: 'append',
        items: payload.comments,
        rootsLoaded: rootsLoadedRef.current + payload.comments.length,
      })
    },
  })

  if (state.rootsLoaded >= state.rootsTotal) {
    return null
  }

  const moreLoading = loadMore.isPending
  const onLoadMore = () => {
    if (loadMore.isPending) {
      return
    }
    loadMore.mutate({
      page_key: commentKey,
      offset: state.rootsLoaded,
    } satisfies LoadCommentsInput)
  }

  return (
    <div className="mt-4 text-center md:mt-6">
      <Button variant="light" onClick={onLoadMore} disabled={moreLoading}>
        {moreLoading ? '加载中…' : '加载更多'}
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
