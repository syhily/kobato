// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CommentsLoaderShape } from '@/shared/config/projection'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { projectCommentsForAdmin } from '@/shared/config/projection'
import { BlogSettingsProvider } from '@/shared/lib/blog-config-context'
import { CommentsForm } from '@/ui/admin/settings/CommentsForm'

mockTanstackQuery()

const commit = vi.hoisted(() => vi.fn())

vi.mock('@/ui/admin/settings/useSettingsMutation', () => ({
  useSettingsMutation: () => ({
    commit,
    isPending: false,
    status: 'idle',
  }),
}))

const baseComments: CommentsLoaderShape = projectCommentsForAdmin(TEST_BLOG_SETTINGS_BUNDLE.comments!)

function renderCommentsForm(comments: CommentsLoaderShape) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <BlogSettingsProvider value={TEST_BLOG_SETTINGS_BUNDLE}>
        <CommentsForm comments={comments} />
      </BlogSettingsProvider>
    </QueryClientProvider>,
  )
}

describe('ui/admin/settings/CommentsForm — avatar card', () => {
  beforeEach(() => {
    commit.mockReset()
  })

  it('commits the mirror change as a field-scoped sparse patch (P1-13)', async () => {
    const savedSection = projectCommentsForAdmin({
      comments: {
        ...TEST_BLOG_SETTINGS_BUNDLE.comments!.comments,
        avatar: {
          ...TEST_BLOG_SETTINGS_BUNDLE.comments!.comments.avatar,
          mirror: 'https://www.gravatar.com/avatar',
        },
      },
    })
    commit.mockResolvedValue({ ok: true, section: savedSection })

    renderCommentsForm(baseComments)

    fireEvent.click(document.getElementById('comments-avatar-mirror')!)
    const option = await waitFor(() => {
      const el = Array.from(document.querySelectorAll('[role="option"]')).find((node) =>
        node.textContent?.includes('Gravatar 官方'),
      )
      expect(el).toBeDefined()
      return el!
    })
    fireEvent.pointerDown(option)
    fireEvent.click(option)

    // SettingsSelect fires save(name): only the trigger field's change is
    // POSTed — sources stay out of this patch and keep their server value.
    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    expect(commit.mock.calls[0]![0]).toBe('comments')
    expect(commit.mock.calls[0]![1]).toEqual({
      comments: {
        avatar: {
          mirror: 'https://www.gravatar.com/avatar',
        },
      },
    })
  })

  it('carries the full sources order in a blur-flush full patch', async () => {
    commit.mockResolvedValue({ ok: true, section: baseComments })

    renderCommentsForm(baseComments)

    const tokenInput = document.getElementById('comments-avatar-github-token')!
    fireEvent.change(tokenInput, { target: { value: 'ghp_new_token' } })
    fireEvent.blur(tokenInput)

    // The blur flush posts fromState in full — a fromState that dropped
    // `sources` would make drag reorders un-persistable.
    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    expect(commit.mock.calls[0]![0]).toBe('comments')
    expect(commit.mock.calls[0]![1]).toEqual({
      comments: {
        avatar: {
          mirror: baseComments.comments.avatar.mirror,
          sources: baseComments.comments.avatar.sources,
        },
        githubToken: 'ghp_new_token',
      },
    })
  })
})
