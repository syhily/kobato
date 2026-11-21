// @vitest-environment happy-dom

import type { ReactElement } from 'react'

import { wrapWithI18n } from '@kobato/ui/tests/utils/i18n-render.tsx'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

function renderUi(ui: ReactElement) {
  return render(wrapWithI18n(ui))
}
import type { MailLoaderShape } from '@kobato/settings/projection.ts'

import { projectMailForAdmin } from '@kobato/settings/projection.ts'
import { mailDefaults } from '@kobato/settings/sections/mail.ts'
import { TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings.ts'
import { MailForm } from '@kobato/web-admin/ui/settings/mail/MailForm.tsx'
import { BlogSettingsProvider } from '@kobato/web-client/settings/blog-settings-context.tsx'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const commit = vi.hoisted(() => vi.fn())

const settingsMutation = await import('@kobato/web-admin/ui/settings/use-settings-mutation.ts')
vi.spyOn(settingsMutation, 'useSettingsMutation').mockImplementation(() => ({
  commit,
  isPending: false,
  status: 'idle',
}))

afterAll(() => {
  vi.restoreAllMocks()
})

function renderMailForm(mail: MailLoaderShape) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return renderUi(
    <QueryClientProvider client={queryClient}>
      <BlogSettingsProvider value={TEST_BLOG_SETTINGS_BUNDLE}>
        <MailForm mail={mail} />
      </BlogSettingsProvider>
    </QueryClientProvider>,
  )
}

describe('ui/admin/settings/mail/MailForm — provider switch', () => {
  beforeEach(() => {
    commit.mockReset()
  })

  it('flips the config card and test-send readiness to the saved provider immediately', async () => {
    const mail = projectMailForAdmin({
      mail: {
        ...mailDefaults.mail,
        transport: 'mailgun',
        mailgunDomain: 'mg.example.com',
        mailgunApiKey: 'mg-secret-key',
      },
    })
    const savedSection = projectMailForAdmin({
      mail: { ...mailDefaults.mail, transport: 'smtp' },
    })
    commit.mockResolvedValue({ ok: true, section: savedSection })

    renderMailForm(mail)
    expect(screen.getByRole('heading', { name: 'Mailgun 配置' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /测试发送/ })).toBeEnabled()

    fireEvent.click(screen.getByRole('combobox'))
    const option = await screen.findByRole('option', { name: 'SMTP' })
    fireEvent.pointerDown(option)
    fireEvent.click(option)

    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    expect(commit.mock.calls[0]![1]).toEqual({ mail: { transport: 'smtp' } })

    await waitFor(() => expect(screen.getByRole('heading', { name: 'SMTP 配置' })).toBeInTheDocument())
    expect(screen.queryByRole('heading', { name: 'Mailgun 配置' })).not.toBeInTheDocument()
    const sendButton = screen.getByRole('button', { name: /测试发送/ })
    expect(sendButton).toBeDisabled()
    expect(sendButton).toHaveAttribute('title', '请先填入并保存 SMTP 服务器地址、用户名、密码和发件人邮箱')
  })
})
