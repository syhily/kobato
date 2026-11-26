// @vitest-environment happy-dom

import type { ReactElement } from 'react'

import { wrapWithI18n } from '@kobato/ui/tests/utils/i18n-render'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, waitFor } from '@testing-library/react'

function renderUi(ui: ReactElement, locale: AppLocale = 'zh-CN') {
  return render(wrapWithI18n(ui, { locale }))
}
import type { AppLocale } from '@kobato/i18n/locales'
import type { CommentsLoaderShape } from '@kobato/settings/projection'

import { projectCommentsForAdmin } from '@kobato/settings/projection'
import { TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings'
import { mockTanstackQuery } from '@kobato/test/mock-react-query'
import { BlogSettingsProvider } from '@kobato/web-kit/ui/lib/blog-settings-context'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { CommentsForm } from '@/ui/settings/comments/CommentsForm'

mockTanstackQuery()

const commit = vi.hoisted(() => vi.fn())

const settingsMutation = await import('@/ui/settings/use-settings-mutation')
vi.spyOn(settingsMutation, 'useSettingsMutation').mockImplementation(() => ({
  commit,
  isPending: false,
  status: 'idle',
}))

afterAll(() => {
  vi.restoreAllMocks()
})

const baseComments: CommentsLoaderShape = projectCommentsForAdmin(TEST_BLOG_SETTINGS_BUNDLE.comments!)

function renderCommentsForm(comments: CommentsLoaderShape, locale: AppLocale = 'zh-CN') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return renderUi(
    <QueryClientProvider client={queryClient}>
      <BlogSettingsProvider value={TEST_BLOG_SETTINGS_BUNDLE}>
        <CommentsForm comments={comments} />
      </BlogSettingsProvider>
    </QueryClientProvider>,
    locale,
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

  it('posts only the fields that changed in a blur flush (token alone)', async () => {
    commit.mockResolvedValue({ ok: true, section: baseComments })

    renderCommentsForm(baseComments)

    const tokenInput = document.getElementById('comments-avatar-github-token')!
    fireEvent.change(tokenInput, { target: { value: 'ghp_new_token' } })
    fireEvent.blur(tokenInput)

    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    expect(commit.mock.calls[0]![0]).toBe('comments')
    expect(commit.mock.calls[0]![1]).toEqual({
      comments: {
        githubToken: 'ghp_new_token',
      },
    })
  })

  async function openMirrorOptions(locale: AppLocale): Promise<string[]> {
    renderCommentsForm(baseComments, locale)
    fireEvent.click(document.getElementById('comments-avatar-mirror')!)

    await waitFor(() => expect(document.querySelectorAll('[role="option"]').length).toBeGreaterThan(0))
    return Array.from(document.querySelectorAll('[role="option"]')).map((node) => node.textContent ?? '')
  }

  it('resolves mirror preset labels in zh-CN', async () => {
    const labels = await openMirrorOptions('zh-CN')

    expect(labels.some((label) => label.includes('Gravatar 官方（www.gravatar.com）'))).toBe(true)
    expect(labels.some((label) => label.includes('极客族（sdn.geekzu.org）'))).toBe(true)
    expect(labels.some((label) => label.includes('mirrorPreset.'))).toBe(false)
    expect(document.body.textContent).not.toContain('admin.settings.comments.avatar.mirrorPreset.')
  })

  it('resolves mirror preset labels in en-US without any raw Chinese label', async () => {
    const labels = await openMirrorOptions('en-US')

    expect(labels.some((label) => label.includes('Gravatar official (www.gravatar.com)'))).toBe(true)
    expect(labels.some((label) => label.includes('Geekzu (sdn.geekzu.org)'))).toBe(true)
    expect(labels.some((label) => label.includes('mirrorPreset.'))).toBe(false)
    expect(labels.join('\n')).not.toMatch(/[\u3400-\u4DBF\u4E00-\u9FFF]/)
  })
})
