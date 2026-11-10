// @vitest-environment happy-dom

import type { ReactElement } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, waitFor } from '@testing-library/react'

import { wrapWithI18n } from '#/_helpers/i18n-render'

// These forms read `useI18n()`; mount the root provider for every RTL render.
function renderUi(ui: ReactElement, locale: AppLocale = 'zh-CN') {
  return render(wrapWithI18n(ui, { locale }))
}
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CommentsLoaderShape } from '@/shared/config/projection'
import type { AppLocale } from '@/shared/i18n/locales'

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

  it('posts only the fields that changed in a blur flush (token alone)', async () => {
    commit.mockResolvedValue({ ok: true, section: baseComments })

    renderCommentsForm(baseComments)

    const tokenInput = document.getElementById('comments-avatar-github-token')!
    fireEvent.change(tokenInput, { target: { value: 'ghp_new_token' } })
    fireEvent.blur(tokenInput)

    // Sparse whole-card commit: the mirror and the sources order equal their
    // acknowledged baseline, so they stay out of the patch (a full re-send would
    // write this tab's stale copy over a peer tab's edit). A reorder still rides
    // the next flush — pinned by tests/unit/ui/admin/settings/shell/
    // use-settings-card-sparse.test.tsx, since drag gestures need real layout.
    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    expect(commit.mock.calls[0]![0]).toBe('comments')
    expect(commit.mock.calls[0]![1]).toEqual({
      comments: {
        githubToken: 'ghp_new_token',
      },
    })
  })

  // The dropdown labels come from the catalog (`t(preset.labelKey)`), never from
  // a Chinese literal baked into `safe-url.ts`.
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
    // Hardcoded literals must not survive in an English render.
    expect(labels.join('\n')).not.toMatch(/[\u3400-\u4DBF\u4E00-\u9FFF]/)
  })
})
