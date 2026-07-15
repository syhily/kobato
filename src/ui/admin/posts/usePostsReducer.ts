import { useEffect, useReducer, useRef } from 'react'
import { useLocation } from 'react-router'

import type { AdminPostDto } from '@/shared/types/posts'

export type PostStatusFilter = 'all' | 'published' | 'draft' | 'hidden' | 'deleted'

function getInitialStatusFromSearch(search: string): PostStatusFilter {
  const status = new URLSearchParams(search).get('status')
  if (status === 'draft' || status === 'published' || status === 'hidden' || status === 'deleted') {
    return status
  }
  return 'all'
}

function getInitialTagFromSearch(search: string): string {
  return new URLSearchParams(search).get('tag') ?? ''
}

function getInitialCategoryFromSearch(search: string): string {
  return new URLSearchParams(search).get('category') ?? ''
}

interface PostsState {
  rows: AdminPostDto[]
  total: number
  q: string
  deletedStatus: 'all' | 'deleted' | 'normal'
  pageSize: number
  status: PostStatusFilter
  /** Derived from `status`; present so the list API payload can read it directly. */
  published?: boolean
  /** Derived from `status`; present so the list API payload can read it directly. */
  visible?: boolean
  category: string
  tag: string
  authorId: string
  sortBy: 'publishedAt' | 'updatedAt'
  sortOrder: 'asc' | 'desc'
}

type PostsAction =
  | { type: 'loaded'; rows: AdminPostDto[]; total: number }
  | { type: 'appended'; rows: AdminPostDto[]; total: number }
  | { type: 'setQ'; value: string }
  | { type: 'setStatus'; value: PostStatusFilter }
  | { type: 'setCategory'; value: string }
  | { type: 'setTag'; value: string }
  | { type: 'setAuthorId'; value: string }
  | { type: 'setSortBy'; value: 'publishedAt' | 'updatedAt' }
  | { type: 'setSortOrder'; value: 'asc' | 'desc' }
  | { type: 'patchPost'; post: AdminPostDto }
  | { type: 'removePost'; id: string }
  | { type: 'prependPost'; post: AdminPostDto }

function deriveStatusFields(status: PostStatusFilter): {
  deletedStatus: 'all' | 'deleted' | 'normal'
  published?: boolean
  visible?: boolean
} {
  if (status === 'deleted') {
    return { deletedStatus: 'deleted' }
  }
  const statusMap: Record<Exclude<PostStatusFilter, 'deleted'>, { published?: boolean; visible?: boolean }> = {
    all: {},
    published: { published: true, visible: true },
    draft: { published: false },
    hidden: { published: true, visible: false },
  }
  return { deletedStatus: 'normal', ...statusMap[status as Exclude<PostStatusFilter, 'deleted'>] }
}

function resetFields(): Partial<PostsState> {
  return {}
}

function postsReducer(state: PostsState, action: PostsAction): PostsState {
  switch (action.type) {
    case 'loaded':
      return { ...state, rows: action.rows, total: action.total }
    case 'appended':
      return { ...state, rows: [...state.rows, ...action.rows], total: action.total }
    case 'setQ':
      return { ...state, q: action.value, ...resetFields() }
    case 'setStatus': {
      const derived = deriveStatusFields(action.value)
      return {
        ...state,
        status: action.value,
        deletedStatus: derived.deletedStatus,
        published: derived.published,
        visible: derived.visible,
      }
    }
    case 'setCategory':
      return { ...state, category: action.value }
    case 'setTag':
      return { ...state, tag: action.value }
    case 'setAuthorId':
      return { ...state, authorId: action.value }
    case 'setSortBy':
      return { ...state, sortBy: action.value }
    case 'setSortOrder':
      return { ...state, sortOrder: action.value }
    case 'patchPost':
      return {
        ...state,
        rows: state.rows.map((row) => (row.id === action.post.id ? { ...row, ...action.post } : row)),
      }
    case 'removePost':
      return {
        ...state,
        rows: state.rows.filter((row) => row.id !== action.id),
        total: Math.max(0, state.total - 1),
      }
    case 'prependPost':
      return { ...state, rows: [action.post, ...state.rows], total: state.total + 1 }
  }
}

export function usePostsReducer() {
  const { search } = useLocation()
  const initialStatus = getInitialStatusFromSearch(search)
  const initialTag = getInitialTagFromSearch(search)
  const initialCategory = getInitialCategoryFromSearch(search)

  const derived = deriveStatusFields(initialStatus)

  const [state, dispatch] = useReducer(postsReducer, {
    rows: [],
    total: 0,
    q: '',
    deletedStatus: derived.deletedStatus,
    pageSize: 10,
    status: initialStatus,
    published: derived.published,
    visible: derived.visible,
    category: initialCategory,
    tag: initialTag,
    authorId: '',
    sortBy: 'publishedAt',
    sortOrder: 'desc',
  })

  // Hold a mutable reference to the latest state so the URL-sync effects can
  // read it without listing state fields as dependencies. Listing them caused
  // a feedback loop: a user dispatch changed state, the effect re-ran, saw the
  // URL was still the old value, and dispatched the old value back.
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  })

  useEffect(() => {
    const urlStatus = getInitialStatusFromSearch(search)
    if (urlStatus !== stateRef.current.status) {
      dispatch({ type: 'setStatus', value: urlStatus })
    }
  }, [search, stateRef, dispatch])

  useEffect(() => {
    const urlTag = getInitialTagFromSearch(search)
    if (urlTag !== stateRef.current.tag) {
      dispatch({ type: 'setTag', value: urlTag })
    }
  }, [search, stateRef, dispatch])

  useEffect(() => {
    const urlCategory = getInitialCategoryFromSearch(search)
    if (urlCategory !== stateRef.current.category) {
      dispatch({ type: 'setCategory', value: urlCategory })
    }
  }, [search, stateRef, dispatch])

  return { state, dispatch }
}

export type PostsReducerDispatch = ReturnType<typeof usePostsReducer>['dispatch']
