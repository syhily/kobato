// @vitest-environment happy-dom

import type { MailLoaderShape } from '@kobato/shared/config/projection'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'

import { mailDefaults } from '@kobato/server/domains/settings/sections/mail'
import { projectMailForAdmin } from '@kobato/shared/config/projection'
import { BlogSettingsProvider } from '@kobato/shared/lib/blog-config-context'
import { MailForm } from '@kobato/ui/admin/settings/MailForm'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const commit = vi.hoisted(() => vi.fn())

vi.mock('@kobato/ui/admin/settings/useSettingsMutation', () => ({
  useSettingsMutation: () => ({
    commit,
    isPending: false,
    status: 'idle',
  }),
}))

function renderMailForm(mail: MailLoaderShape) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <BlogSettingsProvider value={TEST_BLOG_SETTINGS_BUNDLE}>
        <MailForm mail={mail} />
      </BlogSettingsProvider>
    </QueryClientProvider>,
  )
}

describe('ui/admin/settings/MailForm — provider switch', () => {
  beforeEach(() => {
    commit.mockReset()
  })

  it('flips the config card and test-send readiness to the saved provider immediately', async () => {
    // Loader snapshot: Zeabur, fully configured (test-send ready).
    const mail = projectMailForAdmin({
      mail: { ...mailDefaults.mail, apiKey: 'zeabur-secret-key' },
    })
    // The authoritative save response: provider switched to SMTP (untouched
    // SMTP fields still empty — per-provider config survives the switch).
    const savedSection = projectMailForAdmin({
      mail: { ...mailDefaults.mail, transport: 'smtp' },
    })
    commit.mockResolvedValue({ ok: true, section: savedSection })

    renderMailForm(mail)
    expect(screen.getByRole('heading', { name: 'Zeabur ZSend 配置' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /测试发送/ })).toBeEnabled()

    fireEvent.click(screen.getByRole('combobox'))
    const option = await screen.findByRole('option', { name: 'SMTP' })
    fireEvent.pointerDown(option)
    fireEvent.click(option)

    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    expect(commit.mock.calls[0]![1]).toEqual({ mail: { transport: 'smtp' } })

    // No loader revalidate happens after a save — the form must follow the
    // save response: SMTP card mounts, Zeabur card unmounts, and test-send
    // readiness is judged against the NEW provider (SMTP is unconfigured).
    await waitFor(() => expect(screen.getByRole('heading', { name: 'SMTP 配置' })).toBeInTheDocument())
    expect(screen.queryByRole('heading', { name: 'Zeabur ZSend 配置' })).not.toBeInTheDocument()
    const sendButton = screen.getByRole('button', { name: /测试发送/ })
    expect(sendButton).toBeDisabled()
    expect(sendButton).toHaveAttribute('title', '请先填入并保存 SMTP 服务器地址、用户名、密码和发件人邮箱')
  })
})
