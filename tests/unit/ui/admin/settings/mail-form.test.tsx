import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { MailLoaderShape } from '@/shared/config/projection'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'

mockTanstackQuery()

vi.mock('@/shared/lib/blog-config-context', async () => {
  const actual = await vi.importActual<typeof import('@/shared/lib/blog-config-context')>(
    '@/shared/lib/blog-config-context',
  )
  return {
    ...actual,
    useSiteIdentity: () => ({ author: { email: 'admin@example.com' } }),
  }
})

const { MailForm } = await import('@/ui/admin/settings/MailForm')

const baseMail: MailLoaderShape = {
  mail: {
    enabled: false,
    host: '',
    sender: 'noreply@example.com',
    apiKeyMask: null,
    transport: 'zeabur',
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

function mailWithTransport(transport: 'zeabur' | 'smtp' | 'mailgun'): MailLoaderShape {
  return { mail: { ...baseMail.mail, transport } }
}

describe('ui/admin/settings/MailForm', () => {
  it('renders the sender field exactly once regardless of transport', () => {
    for (const transport of ['zeabur', 'smtp', 'mailgun'] as const) {
      const html = renderToStaticMarkup(<MailForm mail={mailWithTransport(transport)} />)
      const senderMatches = html.match(/id="mail-sender"/g) ?? []
      expect(senderMatches.length, `transport=${transport}`).toBe(1)
    }
  })

  it('does not render a sender input inside transport cards', () => {
    const smtpHtml = renderToStaticMarkup(<MailForm mail={mailWithTransport('smtp')} />)
    expect(smtpHtml).not.toContain('id="mail-smtp-sender"')
    expect(smtpHtml).not.toContain('id="mail-mailgun-sender"')

    const zeaburHtml = renderToStaticMarkup(<MailForm mail={mailWithTransport('zeabur')} />)
    expect(zeaburHtml).not.toContain('id="mail-mailgun-sender"')
    expect(zeaburHtml).not.toContain('id="mail-smtp-sender"')
  })
})
