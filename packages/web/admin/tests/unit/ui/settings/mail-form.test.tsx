import type { MailLoaderShape } from '@kobato/settings/projection.ts'

import { wrapWithI18n } from '@kobato/test/i18n-render.tsx'
import { mockTanstackQuery } from '@kobato/test/mock-react-query.ts'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

mockTanstackQuery()

vi.mock('@kobato/web-client/settings/blog-settings-context.tsx', async () => {
  const actual = await vi.importActual<typeof import('@kobato/web-client/settings/blog-settings-context.tsx')>(
    '@kobato/web-client/settings/blog-settings-context.tsx',
  )
  return {
    ...actual,
    useSiteIdentity: () => ({ author: { email: 'admin@example.com' } }),
  }
})

const { MailForm } = await import('@kobato/web-admin/ui/settings/MailForm.tsx')

const baseMail: MailLoaderShape = {
  mail: {
    enabled: false,
    notificationEmails: true,
    sender: 'noreply@example.com',
    transport: 'smtp',
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPassMask: null,
    smtpSecure: true,
    smtpRequireTls: true,
    smtpRejectUnauthorized: true,
    mailgunDomain: '',
    mailgunApiKeyMask: null,
  },
}

function mailWithTransport(transport: 'smtp' | 'mailgun'): MailLoaderShape {
  return { mail: { ...baseMail.mail, transport } }
}

describe('ui/admin/settings/MailForm', () => {
  it('renders the sender field exactly once regardless of transport', () => {
    for (const transport of ['smtp', 'mailgun'] as const) {
      const html = renderToStaticMarkup(wrapWithI18n(<MailForm mail={mailWithTransport(transport)} />))
      const senderMatches = html.match(/id="mail-sender"/g) ?? []
      expect(senderMatches.length, `transport=${transport}`).toBe(1)
    }
  })

  it('does not render a sender input inside transport cards', () => {
    const smtpHtml = renderToStaticMarkup(wrapWithI18n(<MailForm mail={mailWithTransport('smtp')} />))
    expect(smtpHtml).not.toContain('id="mail-smtp-sender"')
    expect(smtpHtml).not.toContain('id="mail-mailgun-sender"')

    const mailgunHtml = renderToStaticMarkup(wrapWithI18n(<MailForm mail={mailWithTransport('mailgun')} />))
    expect(mailgunHtml).not.toContain('id="mail-mailgun-sender"')
    expect(mailgunHtml).not.toContain('id="mail-smtp-sender"')
  })
})
