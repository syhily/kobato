import { useEffect, useReducer, useRef } from 'react'
import { useLocation } from 'react-router'

import type { AdminPostDto } from '@/shared/types/posts'

export type PostStatusFilter = 'all' | 'published' | 'draft' | 'hidden'

function getInitialStatusFromSearch(search: string): PostStatusFilter {
  const status = new URLSearchParams(search).get('status')
  if (status === 'draft' || status === 'published' || status === 'hidden') {
    return status
  }
  return 'all'
}

interface PostsState {
  rows: AdminPostDto[]
  total: number
  q: string
  deletedStatus: 'all' | 'deleted' | 'normal'
  currentPage: number
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
  | { type: 'setQ'; value: string }
  | { type: 'setDeletedStatus'; value: 'all' | 'deleted' | 'normal' }
  | { type: 'setCurrentPage'; value: number }
  | { type: 'setPageSize'; value: number }
  | { type: 'setStatus'; value: PostStatusFilter }
  | { type: 'setCategory'; value: string }
  | { type: 'setTag'; value: string }
  | { type: 'setAuthorId'; value: string }
  | { type: 'setSortBy'; value: 'publishedAt' | 'updatedAt' }
  | { type: 'setSortOrder'; value: 'asc' | 'desc' }
  | { type: 'patchPost'; post: AdminPostDto }
  | { type: 'removePost'; id: string }
  | { type: 'prependPost'; post: AdminPostDto }

function postsReducer(state: PostsState, action: PostsAction): PostsState {
  switch (action.type) {
    case 'loaded':
      return { ...state, rows: action.rows, total: action.total }
    case 'setQ':
      return { ...state, q: action.value, currentPage: 0 }
    case 'setDeletedStatus':
      return { ...state, deletedStatus: action.value, currentPage: 0 }
    case 'setCurrentPage':
      return { ...state, currentPage: action.value }
    case 'setPageSize':
      return { ...state, pageSize: action.value, currentPage: 0 }
    case 'setStatus': {
      const statusMap: Record<PostStatusFilter, { published?: boolean; visible?: boolean }> = {
        all: {},
        published: { published: true, visible: true },
        draft: { published: false },
        hidden: { published: true, visible: false },
      }
      const map = statusMap[action.value]
      return {
        ...state,
        status: action.value,
        published: map.published,
        visible: map.visible,
        currentPage: 0,
      }
    }
    case 'setCategory':
      return { ...state, category: action.value, currentPage: 0 }
    case 'setTag':
      return { ...state, tag: action.value, currentPage: 0 }
    case 'setAuthorId':
      return { ...state, authorId: action.value, currentPage: 0 }
    case 'setSortBy':
      return { ...state, sortBy: action.value, currentPage: 0 }
    case 'setSortOrder':
      return { ...state, sortOrder: action.value, currentPage: 0 }
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

export function usePostsController() {
  const { search } = useLocation()
  const initialStatus = getInitialStatusFromSearch(search)

  const statusMap: Record<PostStatusFilter, { published?: boolean; visible?: boolean }> = {
    all: {},
    published: { published: true, visible: true },
    draft: { published: false },
    hidden: { published: true, visible: false },
  }
  const map = statusMap[initialStatus]

  const [state, dispatch] = useReducer(postsReducer, {
    rows: [],
    total: 0,
    q: '',
    deletedStatus: 'normal',
    currentPage: 0,
    pageSize: 10,
    status: initialStatus,
    published: map.published,
    visible: map.visible,
    category: '',
    tag: '',
    authorId: '',
    sortBy: 'publishedAt',
    sortOrder: 'desc',
  })

  const statusRef = useRef(state.status)
  statusRef.current = state.status

  useEffect(() => {
    const urlStatus = getInitialStatusFromSearch(search)
    if (urlStatus !== statusRef.current) {
      dispatch({ type: 'setStatus', value: urlStatus })
    }
  }, [search])

  return { state, dispatch }
}

export type PostsControllerDispatch = ReturnType<typeof usePostsController>['dispatch']
