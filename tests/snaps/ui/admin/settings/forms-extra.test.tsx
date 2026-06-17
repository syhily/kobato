import { describe, expect, it, vi } from 'vitest'

import type { MailLoaderShape } from '@/ui/admin/settings/MailForm'

import { renderToHtml, stableHtml } from '#/_helpers/render'
import { MailForm } from '@/ui/admin/settings/MailForm'

// `useSettingsMutation` (consumed by every `useSettingsCard`) fires a real
// `useMutation` against the settings ORPC endpoint. Stubbed inert so the
// forms render without a network stack — the same pattern used by
// `admin/settings/forms.test.tsx`.
vi.mock('@/ui/admin/settings/useSettingsMutation', () => ({
  useSettingsMutation: () => ({
    commit: vi.fn(),
    resetStatus: vi.fn(),
    revalidate: vi.fn(),
    isPending: false,
    status: 'idle',
  }),
}))

// MailTestCard calls `useMutation(orpc.admin.mail.sendTest, …)`. The mock
// below returns an inert mutation tuple so the test-send button renders
// without a network call. `@tanstack/react-query` is otherwise left intact.
const mailTestMutation = vi.hoisted(() => ({ isPending: false, mutate: vi.fn() }))
vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useMutation: () => mailTestMutation,
  }
})

// `orpc` is only reached when a mutation actually fires; the mock above
// intercepts before invocation, but keep the import resolvable & inert.
vi.mock('@/client/api/client', () => ({
  orpc: {
    admin: {
      mail: { sendTest: vi.fn(async () => ({})) },
    },
  },
}))

// ───────────────────────────── fixtures ─────────────────────────────
//
// `MailLoaderShape` is the masked form-facing mirror of `MailSettings`:
// the encrypted secrets (`apiKey`, `smtpPass`, `mailgunApiKey`) are swapped
// out for `*Mask` fields holding the trailing fragment of the secret (or
// null when never configured). The `mail:` wrapper matches `mailSchema`
// so patches validate on the server without translation.

const zeaburPopulated: MailLoaderShape = {
  mail: {
    enabled: true,
    host: 'api.zeabur.com',
    sender: 'noreply@example.com',
    apiKeyMask: '••••key',
    transport: 'zeabur',
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

const smtpPopulated: MailLoaderShape = {
  mail: {
    enabled: true,
    host: '',
    sender: 'postmaster@example.com',
    apiKeyMask: null,
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
    host: '',
    sender: 'mailgun@example.com',
    apiKeyMask: null,
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

// Empty / never-configured fixture: every transport is left blank so the
// per-transport "尚未配置" hint copy renders and the test-send button
// stays disabled (configured=false).
const emptyMail: MailLoaderShape = {
  mail: {
    enabled: false,
    host: '',
    sender: '',
    apiKeyMask: null,
    transport: 'zeabur',
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

// ───────────────────────────── MailForm ─────────────────────────────

describe('snapshot: MailForm', () => {
  it('renders the Zeabur transport branch with populated config', () => {
    const html = stableHtml(renderToHtml(<MailForm mail={zeaburPopulated} />))
    // Master toggle card.
    expect(html).toContain('邮件发送总开关')
    expect(html).toContain('id="mail-enabled"')
    expect(html).toContain('发送通知邮件')
    // Provider select. `<SelectContent>` is a Base UI portal and only mounts
    // its items when open, so on SSR only the trigger's selected-value label
    // is emitted — assert on the active transport label, not the option list.
    expect(html).toContain('邮件服务提供商')
    expect(html).toContain('id="mail-transport"')
    expect(html).toContain('Zeabur ZSend')
    // Sender card (shared across transports).
    expect(html).toContain('发件人邮箱')
    expect(html).toContain('id="mail-sender"')
    // Zeabur config card is the active branch (smtp / mailgun cards omitted).
    expect(html).toContain('Zeabur ZSend 配置')
    expect(html).toContain('id="mail-host"')
    expect(html).toContain('id="mail-api-key"')
    // api key is configured → the "已配置（结尾 …<mask>）" hint shows.
    expect(html).toContain('当前已配置（结尾 …••••key）')
    expect(html).toContain('留空保存表示保留现有 Key')
    // SMTP / Mailgun config cards do NOT render for the zeabur transport.
    expect(html).not.toContain('SMTP 配置')
    expect(html).not.toContain('Mailgun 配置')
    // Test-send card: configured=true (host+sender+apiKeyMask all set) so the
    // button is enabled. The blog-settings test bundle seeds the author email
    // (syhily@gmail.com) as the default `testTo`, which isLikelyEmail accepts.
    expect(html).toContain('测试发送')
    expect(html).not.toContain('请先填入并保存 Zeabur 接入域名')
  })

  it('renders the SMTP transport branch with populated config', () => {
    const html = stableHtml(renderToHtml(<MailForm mail={smtpPopulated} />))
    // SMTP card is the active branch.
    expect(html).toContain('SMTP 配置')
    expect(html).toContain('id="mail-smtp-host"')
    expect(html).toContain('id="mail-smtp-port"')
    expect(html).toContain('id="mail-smtp-user"')
    expect(html).toContain('id="mail-smtp-pass"')
    expect(html).toContain('id="mail-smtp-secure"')
    expect(html).toContain('id="mail-smtp-require-tls"')
    expect(html).toContain('id="mail-smtp-reject-unauthorized"')
    // SMTP password is configured → the mask hint shows.
    expect(html).toContain('当前已配置（结尾 …••••pass）')
    // TLS / require-TLS / cert verify toggle labels.
    expect(html).toContain('启用 TLS（SSL）')
    expect(html).toContain('强制 TLS（requireTLS）')
    expect(html).toContain('验证 TLS 证书')
    // Zeabur / Mailgun cards omitted.
    expect(html).not.toContain('Zeabur ZSend 配置')
    expect(html).not.toContain('Mailgun 配置')
  })

  it('renders the Mailgun transport branch with populated config', () => {
    const html = stableHtml(renderToHtml(<MailForm mail={mailgunPopulated} />))
    // Mailgun card is the active branch.
    expect(html).toContain('Mailgun 配置')
    expect(html).toContain('id="mail-mailgun-domain"')
    expect(html).toContain('id="mail-mailgun-api-key"')
    expect(html).toContain('仅支持美国（US）区域')
    // Mailgun API key is configured → mask hint shows.
    expect(html).toContain('当前已配置（结尾 …••••mgkey）')
    // Zeabur / SMTP cards omitted.
    expect(html).not.toContain('Zeabur ZSend 配置')
    expect(html).not.toContain('SMTP 配置')
  })

  it('renders the empty (never-configured) state and disables test-send', () => {
    const html = stableHtml(renderToHtml(<MailForm mail={emptyMail} />))
    // No API key configured → the "尚未配置" hint renders for each secret
    // input, with transport-specific copy.
    expect(html).toContain('尚未配置。在 Zeabur 控制台 ZSend 服务页面生成的密钥。')
    // Empty sender + no api key → configured=false → the test-send button is
    // disabled AND the transport-specific missing-config hint is surfaced via
    // the button `title` attribute (zeabur copy for the default transport).
    expect(html).toContain('disabled=""')
    expect(html).toContain('请先填入并保存 Zeabur 接入域名、API Key 和发件人邮箱')
  })

  it('renders the pending test-send state', () => {
    mailTestMutation.isPending = true
    try {
      const html = stableHtml(renderToHtml(<MailForm mail={zeaburPopulated} />))
      // Pending mutation → button label swaps to "发送中…" and stays disabled.
      expect(html).toContain('发送中…')
      expect(html).toContain('disabled=""')
    } finally {
      mailTestMutation.isPending = false
    }
  })
})
