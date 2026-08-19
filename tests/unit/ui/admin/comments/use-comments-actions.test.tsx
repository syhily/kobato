// @vitest-environment happy-dom

import type { ReactNode } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminCommentWire as AdminComment } from '@/shared/contracts/comments'

import { makeAdminComment } from '#/_helpers/catalog'

// Drives `useCommentsController` at the hook level; the plain-object
// `orpc` mock covers loadAll and the three comment mutations.
const api = vi.hoisted(() => ({
  loadAll: vi.fn(),
  approve: vi.fn(),
  deleteComment: vi.fn(),
  approveCommentDeletion: vi.fn(),
  searchPages: vi.fn(),
  searchAuthors: vi.fn(),
}))

vi.mock('@/client/api/client', () => ({
  orpc: {
    admin: {
      comments: {
        loadAll: (input: unknown) => api.loadAll(input),
        approve: (input: unknown) => api.approve(input),
        delete: (input: unknown) => api.deleteComment(input),
        approveCommentDeletion: (input: unknown) => api.approveCommentDeletion(input),
        searchPages: (input: unknown) => api.searchPages(input),
        searchAuthors: (input: unknown) => api.searchAuthors(input),
      },
    },
  },
}))

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastMock }))

import { COMMENT_FILTER_FIELDS } from '@/ui/admin/comments/filter-fields'
import {
  useCommentsController,
  type AdminCommentsPage,
  type CommentIntents,
} from '@/ui/admin/comments/useCommentsController'
import { useFilterPills } from '@/ui/admin/shared/filter-bar/useFilterPills'

// Real effects required — unlike the controller's SSR `#/_helpers/hook` suite.
function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }
}

function makeIntents() {
  return { edit: vi.fn(), reply: vi.fn(), editUser: vi.fn() } satisfies CommentIntents
}

// Boots the controller with one loaded page and bridges a real
// `useFilterPills` exactly as `CommentsView` does.
async function setupController(pageComments: AdminComment[], statusCounts?: AdminCommentsPage['statusCounts']) {
  const counts = statusCounts ?? {
    all: pageComments.length,
    pending: pageComments.filter((c) => c.isPending).length,
    approved: pageComments.filter((c) => !c.isPending && !c.deleteRequestedAt).length,
    deleteRequested: pageComments.filter((c) => c.deleteRequestedAt).length,
  }
  api.loadAll.mockResolvedValue({
    comments: pageComments,
    total: pageComments.length,
    hasMore: false,
    statusCounts: counts,
  })
  const intents = makeIntents()
  const view = renderHook(
    () => {
      const pills = useFilterPills({ fields: COMMENT_FILTER_FIELDS, initial: [] })
      const controller = useCommentsController({
        filters: pills.filters,
        dispatch: pills.dispatch,
        queryInput: pills.queryInput(),
        intents,
      })
      return { ...controller, filters: pills.filters }
    },
    { wrapper: makeWrapper() },
  )
  await waitFor(() => expect(view.result.current.comments).toHaveLength(pageComments.length))
  return { ...view, intents }
}

beforeEach(() => {
  api.loadAll.mockReset()
  api.approve.mockReset()
  api.deleteComment.mockReset()
  api.approveCommentDeletion.mockReset()
  api.searchPages.mockReset()
  api.searchAuthors.mockReset()
  toastMock.error.mockClear()
  // happy-dom lacks scrollTo; pin a no-op.
  Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true, configurable: true })
})

describe('useCommentsController comment actions — confirm choreography', () => {
  it('approve(comment) opens the 通过 confirm; confirming fires the mutation and patches the cache', async () => {
    const comment = makeAdminComment({ isPending: true })
    const { result } = await setupController([comment])

    expect(result.current.confirm).toBeNull()
    act(() => result.current.actions.approve(comment))

    expect(result.current.confirm).toMatchObject({
      title: '审核通过该评论？',
      description: '审核通过后评论会立即对所有访客可见，并向作者发送通知邮件。',
      actionLabel: '通过',
      destructive: false,
    })
    // Nothing fires until the dialog confirms.
    expect(api.approve).not.toHaveBeenCalled()

    api.approve.mockResolvedValue(undefined)
    await act(async () => result.current.confirm?.onConfirm())

    expect(api.approve).toHaveBeenCalledWith({ commentId: comment.id })
    await waitFor(() => expect(result.current.comments[0]?.isPending).toBe(false))
    expect(result.current.statusCounts).toEqual({ all: 1, pending: 0, approved: 1, deleteRequested: 0 })
  })

  it('remove(comment) opens the destructive 删除 confirm; confirming deletes and drops the row from the cache', async () => {
    const comment = makeAdminComment()
    const { result } = await setupController([comment])

    act(() => result.current.actions.remove(comment))

    expect(result.current.confirm).toMatchObject({
      title: '删除该评论？',
      description: '此操作不可撤销，删除后评论从前后台彻底消失。',
      actionLabel: '删除',
      destructive: true,
    })

    api.deleteComment.mockResolvedValue(undefined)
    await act(async () => result.current.confirm?.onConfirm())

    expect(api.deleteComment).toHaveBeenCalledWith({ commentId: comment.id })
    await waitFor(() => expect(result.current.comments).toHaveLength(0))
    expect(result.current.statusCounts).toEqual({ all: 0, pending: 0, approved: 0, deleteRequested: 0 })
  })

  it('approveDeletion(comment) confirms with approve: true and drops the row from the cache', async () => {
    const comment = makeAdminComment({ deleteRequestedAt: '2024-01-02T00:00:00.000Z' })
    const { result } = await setupController([comment], { all: 1, pending: 0, approved: 0, deleteRequested: 1 })

    act(() => result.current.actions.approveDeletion(comment))

    expect(result.current.confirm).toMatchObject({
      title: '同意删除该评论？',
      description: '同意后评论会被标记为已删除，并从前后台隐藏。',
      actionLabel: '同意删除',
      destructive: true,
    })

    api.approveCommentDeletion.mockResolvedValue(undefined)
    await act(async () => result.current.confirm?.onConfirm())

    expect(api.approveCommentDeletion).toHaveBeenCalledWith({ commentId: comment.id, approve: true })
    await waitFor(() => expect(result.current.comments).toHaveLength(0))
  })

  it('rejectDeletion(comment) confirms with approve: false and restores the pending state of a pending comment', async () => {
    const comment = makeAdminComment({ isPending: true, deleteRequestedAt: '2024-01-02T00:00:00.000Z' })
    const { result } = await setupController([comment], { all: 1, pending: 0, approved: 0, deleteRequested: 1 })

    act(() => result.current.actions.rejectDeletion(comment))

    expect(result.current.confirm).toMatchObject({
      title: '拒绝删除申请？',
      description: '拒绝后该评论会恢复为正常状态，作者需要重新申请才能再次删除。',
      actionLabel: '拒绝删除',
      destructive: false,
    })

    api.approveCommentDeletion.mockResolvedValue(undefined)
    await act(async () => result.current.confirm?.onConfirm())

    expect(api.approveCommentDeletion).toHaveBeenCalledWith({ commentId: comment.id, approve: false })
    await waitFor(() => expect(result.current.comments[0]?.deleteRequestedAt).toBeNull())
    expect(result.current.statusCounts).toEqual({ all: 1, pending: 1, approved: 0, deleteRequested: 0 })
  })

  it('surfaces the 处理删除申请失败 toast when the deletion resolution fails', async () => {
    const comment = makeAdminComment({ deleteRequestedAt: '2024-01-02T00:00:00.000Z' })
    const { result } = await setupController([comment], { all: 1, pending: 0, approved: 0, deleteRequested: 1 })

    act(() => result.current.actions.rejectDeletion(comment))
    api.approveCommentDeletion.mockRejectedValue(new Error('boom'))
    await act(async () => result.current.confirm?.onConfirm())

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('处理删除申请失败', { description: 'boom' }))
    expect(result.current.comments).toHaveLength(1)
    expect(result.current.comments[0]?.deleteRequestedAt).not.toBeNull()
  })

  it('closeConfirm dismisses the open dialog without firing the mutation', async () => {
    const comment = makeAdminComment({ isPending: true })
    const { result } = await setupController([comment])

    act(() => result.current.actions.approve(comment))
    expect(result.current.confirm).not.toBeNull()

    act(() => result.current.closeConfirm())
    expect(result.current.confirm).toBeNull()
    expect(api.approve).not.toHaveBeenCalled()
  })
})

describe('useCommentsController comment actions — pending gates and intents', () => {
  it('gates isApproving per comment while the shared mutation is in flight', async () => {
    const a = makeAdminComment({ isPending: true })
    const b = makeAdminComment({ isPending: true })
    const { result } = await setupController([a, b], { all: 2, pending: 2, approved: 0, deleteRequested: 0 })

    let resolveApprove!: () => void
    api.approve.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveApprove = resolve
        }),
    )

    act(() => result.current.actions.approve(a))
    await act(async () => result.current.confirm?.onConfirm())

    await waitFor(() => expect(result.current.actions.isApproving(a)).toBe(true))
    // Only the in-flight comment's row disables its button.
    expect(result.current.actions.isApproving(b)).toBe(false)
    expect(result.current.actions.isRemoving(a)).toBe(false)

    await act(async () => resolveApprove())
    await waitFor(() => expect(result.current.actions.isApproving(a)).toBe(false))
  })

  it('wires the view-owned editor intents through the actions object', async () => {
    const comment = makeAdminComment()
    const { result, intents } = await setupController([comment])

    act(() => result.current.actions.edit(comment))
    act(() => result.current.actions.reply(comment))
    act(() => result.current.actions.editUser(comment))

    expect(intents.edit).toHaveBeenCalledWith(comment)
    expect(intents.reply).toHaveBeenCalledWith(comment)
    expect(intents.editUser).toHaveBeenCalledWith(comment)
  })

  it('filterByPage / filterByAuthor dispatch addFilter and scroll to the top', async () => {
    const comment = makeAdminComment()
    const { result } = await setupController([comment])

    act(() => result.current.actions.filterByPage('page-1', 'Hello World'))
    expect(result.current.filters).toEqual([{ field: 'page', value: 'page-1', label: 'Hello World' }])
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })

    act(() => result.current.actions.filterByAuthor('user-1', 'Alice'))
    expect(result.current.filters).toContainEqual({ field: 'author', value: 'user-1', label: 'Alice' })
  })
})
