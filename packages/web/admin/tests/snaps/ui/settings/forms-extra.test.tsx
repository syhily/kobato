import type { MailLoaderShape } from '@kobato/settings/projection.ts'

import { mockTanstackQuery } from '@kobato/test/mock-react-query.ts'
import { renderToHtml, stableHtml } from '@kobato/web-admin/tests/utils/render.tsx'
import { MailForm } from '@kobato/web-admin/ui/settings/mail/MailForm.tsx'
import { describe, expect, it, vi } from 'vitest'

const queryMocks = mockTanstackQuery()

queryMocks.mutation = { isPending: false, mutate: vi.fn() }

vi.mock('@kobato/web-client/api/client.ts', () => ({
  orpc: {
    admin: {
      mail: { sendTest: vi.fn(async () => ({})) },
    },
  },
}))

const smtpPopulated: MailLoaderShape = {
  mail: {
    enabled: true,
    notificationEmails: true,
    sender: 'postmaster@example.com',
    transport: 'smtp',
    smtpHost: 'smtp.example.com',
    smtpPort: 465,
    smtpUser: 'postmaster@example.com',
    smtpPassMask: '••••pass',
    smtpSecure: true,
    smtpRequireTls: true,
    smtpRejectUnauthorized: true,
    mailgunDomain: '',
    mailgunApiKeyMask: null,
  },
}

const mailgunPopulated: MailLoaderShape = {
  mail: {
    enabled: true,
    notificationEmails: true,
    sender: 'mailgun@example.com',
    transport: 'mailgun',
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPassMask: null,
    smtpSecure: false,
    smtpRequireTls: true,
    smtpRejectUnauthorized: true,
    mailgunDomain: 'mg.example.com',
    mailgunApiKeyMask: '••••mgkey',
  },
}

const emptyMail: MailLoaderShape = {
  mail: {
    enabled: false,
    notificationEmails: true,
    sender: '',
    transport: 'smtp',
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPassMask: null,
    smtpSecure: false,
    smtpRequireTls: true,
    smtpRejectUnauthorized: true,
    mailgunDomain: '',
    mailgunApiKeyMask: null,
  },
}

describe('snapshot: MailForm', () => {
  it('renders the SMTP transport branch with populated config', () => {
    const html = stableHtml(renderToHtml(<MailForm mail={smtpPopulated} />))
    expect(html).toContain('邮件发送总开关')
    expect(html).toContain('id="mail-enabled"')
    expect(html).toContain('发送通知邮件')
    expect(html).toContain('邮件服务提供商')
    expect(html).toContain('id="mail-transport"')
    expect(html).toContain('发件人邮箱')
    expect(html).toContain('id="mail-sender"')
    expect(html).toContain('SMTP 配置')
    expect(html).toContain('id="mail-smtp-host"')
    expect(html).toContain('id="mail-smtp-port"')
    expect(html).toContain('id="mail-smtp-user"')
    expect(html).toContain('id="mail-smtp-pass"')
    expect(html).toContain('id="mail-smtp-secure"')
    expect(html).toContain('id="mail-smtp-require-tls"')
    expect(html).toContain('id="mail-smtp-reject-unauthorized"')
    expect(html).toContain('当前已配置（结尾 …••••pass）')
    expect(html).toContain('启用 TLS（SSL）')
    expect(html).toContain('强制 TLS（requireTLS）')
    expect(html).toContain('验证 TLS 证书')
    expect(html).not.toContain('Mailgun 配置')
    expect(html).toContain('测试发送')
    expect(html).not.toContain('请先填入并保存 SMTP 服务器地址')
  })

  it('renders the Mailgun transport branch with populated config', () => {
    const html = stableHtml(renderToHtml(<MailForm mail={mailgunPopulated} />))
    expect(html).toContain('Mailgun 配置')
    expect(html).toContain('id="mail-mailgun-domain"')
    expect(html).toContain('id="mail-mailgun-api-key"')
    expect(html).toContain('仅支持美国（US）区域')
    expect(html).toContain('当前已配置（结尾 …••••mgkey）')
    expect(html).not.toContain('SMTP 配置')
  })

  it('renders the empty (never-configured) state and disables test-send', () => {
    const html = stableHtml(renderToHtml(<MailForm mail={emptyMail} />))
    expect(html).toContain('尚未配置')
    expect(html).toContain('disabled=""')
    expect(html).toContain('请先填入并保存 SMTP 服务器地址、用户名、密码和发件人邮箱')
  })

  it('renders the pending test-send state', () => {
    queryMocks.mutation.isPending = true
    try {
      const html = stableHtml(renderToHtml(<MailForm mail={smtpPopulated} />))
      expect(html).toContain('发送中…')
      expect(html).toContain('disabled=""')
    } finally {
      queryMocks.mutation.isPending = false
    }
  })
})
