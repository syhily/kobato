import type { MailTransport, SendOptions, SendResult } from '@/server/infra/email/types'

import { render } from '@/server/infra/email/render'
import AuthorInvite from '@/server/infra/email/templates/AuthorInvite'
import PasswordReset from '@/server/infra/email/templates/PasswordReset'
import SignInOtp from '@/server/infra/email/templates/SignInOtp'
import { MailgunTransport } from '@/server/infra/email/transports/mailgun'
import { SmtpTransport } from '@/server/infra/email/transports/smtp'
import { ZeaburZSendTransport } from '@/server/infra/email/transports/zeabur-zsend'
import { getLogger } from '@/server/infra/logger'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { escapeHtml } from '@/shared/utils/security'

// Re-export the shared transport types so existing call sites that
// imported them from `sender.ts` keep working after the move to
// `@/server/infra/email/types`. Adding new transports does not require
// touching this file.
export type { EmailMessage, SendOptions, SendResult } from '@/server/infra/email/types'

const log = getLogger('email')

// OTP TTL mirrored from auth domain so the email layer does not import
// a business domain. Kept in sync with OTP_TTL_MS in verification-tokens.ts.
const OTP_TTL_MINUTES = 5

interface MailConfig {
  enabled: boolean
  host: string
  apiKey: string
  sender: string
  transport: 'zeabur' | 'smtp' | 'mailgun'
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass: string
  smtpSecure: boolean
  mailgunDomain: string
  mailgunApiKey: string
}

// Read the live mail slice straight from the snapshot. Mail senders only
// run from server-side code paths that already sit behind the install
// gate, so `requireBlogSettingsSection()` is the right call — a `null`
// here would be a regression in the gate, not a runtime mode we need to
// support.
function readMailConfig(): MailConfig {
  return requireBlogSettingsSection('mail').mail
}

interface CheckMailReadyOptions {
  /** Test sends bypass the master switch so editors can verify connectivity first. */
  ignoreEnabled?: boolean
}

// Single source of truth for "should this notification actually fire?"
// — used both internally by the comment-fired senders and by the admin
// "send test" action so the UI can surface the same skip reason.
// Test sends pass `{ ignoreEnabled: true }` so they can verify the
// connection before the master toggle is flipped on.
export function checkMailReady(
  mail: MailConfig,
  options: CheckMailReadyOptions = {},
): { ready: true } | { ready: false; reason: 'disabled' | 'unconfigured'; message: string } {
  if (!options.ignoreEnabled && !mail.enabled) {
    return { ready: false, reason: 'disabled', message: '邮件发送已在管理面板中关闭' }
  }
  const transport = mail.transport ?? 'zeabur'
  if (transport === 'smtp') {
    if (!mail.smtpHost || !mail.smtpUser || !mail.smtpPass || !mail.sender) {
      return {
        ready: false,
        reason: 'unconfigured',
        message: 'SMTP 服务尚未配置完整（缺少服务器地址 / 用户名 / 密码 / 发件人）',
      }
    }
    return { ready: true }
  }
  if (transport === 'mailgun') {
    if (!mail.mailgunDomain || !mail.mailgunApiKey || !mail.sender) {
      return {
        ready: false,
        reason: 'unconfigured',
        message: 'Mailgun 服务尚未配置完整（缺少 Domain / API Key / 发件人）',
      }
    }
    return { ready: true }
  }
  if (!mail.host || !mail.apiKey || !mail.sender) {
    return {
      ready: false,
      reason: 'unconfigured',
      message: 'Zeabur 邮件服务尚未配置完整（缺少 Host / API Key / 发件人）',
    }
  }
  return { ready: true }
}

interface InternalSendOptions {
  /** Optional BCC list. Used by admin-author-invite to keep the inviter on the audit trail. */
  bcc?: string[]
}

// Resolve the live transport from the configured mail slice.
function getTransport(): MailTransport {
  const mail = readMailConfig()
  const transport = mail.transport ?? 'zeabur'
  if (transport === 'smtp') {
    return new SmtpTransport({
      enabled: mail.enabled,
      sender: mail.sender,
      host: mail.smtpHost,
      port: mail.smtpPort,
      user: mail.smtpUser,
      pass: mail.smtpPass,
      secure: mail.smtpSecure,
    })
  }
  if (transport === 'mailgun') {
    return new MailgunTransport({
      enabled: mail.enabled,
      sender: mail.sender,
      domain: mail.mailgunDomain,
      apiKey: mail.mailgunApiKey,
    })
  }
  if (transport !== 'zeabur') {
    log.warn('Unknown mail transport, falling back to Zeabur ZSend', { transport })
  }
  return new ZeaburZSendTransport({
    enabled: mail.enabled,
    sender: mail.sender,
    host: mail.host,
    apiKey: mail.apiKey,
  })
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  options: InternalSendOptions = {},
): Promise<SendResult> {
  const transport = getTransport()
  const sendOptions: SendOptions = options.bcc ? { bcc: options.bcc } : {}
  return transport.send({ to, subject, html }, sendOptions)
}

// Re-export render so domain email composers can build HTML from React
// Email components without reaching into `infra/email/render` directly.
const renderEmail = render
export { render, render as renderEmail }

// Sent to a newly invited author with a setup link. The inviter is
// BCC'd so admin actions stay on the audit trail (the recipient does
// not see the BCC).
export async function sendAuthorInvite(
  user: { name: string; email: string },
  link: string,
  inviterName: string,
  inviterEmail?: string,
): Promise<SendResult> {
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  const html = renderEmail(
    AuthorInvite({
      receiver: user.name,
      inviter: inviterName,
      link,
    }),
  )
  return sendEmail(user.email, `【${siteIdentity.title}】作者邀请`, html, {
    bcc: inviterEmail ? [inviterEmail] : undefined,
  })
}

// Sent when a user requests a password reset.
export async function sendPasswordReset(user: { name: string; email: string }, link: string): Promise<SendResult> {
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  const html = renderEmail(
    PasswordReset({
      receiver: user.name,
      link,
    }),
  )
  return sendEmail(user.email, `【${siteIdentity.title}】密码重置`, html)
}

// Sent when a user logs in with OTP enabled.
export async function sendSignInOtp(user: { name: string; email: string }, otpCode: string): Promise<SendResult> {
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  const html = renderEmail(
    SignInOtp({
      receiver: user.name,
      otpCode,
      expiresMinutes: OTP_TTL_MINUTES,
    }),
  )
  return sendEmail(user.email, `【${siteIdentity.title}】登录验证码`, html)
}

// `enabled` master switch on purpose: an editor needs to verify the
// connection to upstream BEFORE flipping the public toggle. The
// `unconfigured` guard still applies — there's no point round-tripping
// to the provider with an empty key.
export async function sendTestMail(to: string): Promise<SendResult> {
  const mail = readMailConfig()
  const ready = checkMailReady(mail, { ignoreEnabled: true })
  if (!ready.ready) {
    log.warn('Test mail skipped', { to, reason: ready.reason })
    return { ok: false, reason: ready.reason, message: ready.message }
  }

  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  const subject = `【${siteIdentity.title}】管理员邮件测试`
  const sentAt = new Date().toISOString()
  // Keep the test body intentionally plain (no React Email render) so a
  // failure here points at the transport plumbing rather than the
  // template renderer.
  const html = [
    `<p>这是一封来自 <strong>${escapeHtml(siteIdentity.title)}</strong> 后台的邮件发送测试。</p>`,
    `<p>如果你收到了这封邮件，说明邮件服务配置工作正常。</p>`,
    `<ul>`,
    `<li>站点：${escapeHtml(siteIdentity.website)}</li>`,
    `<li>发件人：${escapeHtml(mail.sender)}</li>`,
    `<li>触发时间（UTC）：${sentAt}</li>`,
    `</ul>`,
  ].join('\n')

  // Send through the configured transport so the test exercises the
  // same code path as production notifications, but force `enabled: true`
  // so editors can verify connectivity before flipping the public toggle.
  const transport = buildTransportForTest(mail)
  try {
    return await transport.send({ to, subject, html })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.error('Test mail send failed: transport error', { to, error })
    return { ok: false, reason: 'network', message }
  }
}

function buildTransportForTest(mail: MailConfig): MailTransport {
  const transport = mail.transport ?? 'zeabur'
  if (transport === 'smtp') {
    return new SmtpTransport({
      enabled: true,
      sender: mail.sender,
      host: mail.smtpHost,
      port: mail.smtpPort,
      user: mail.smtpUser,
      pass: mail.smtpPass,
      secure: mail.smtpSecure,
    })
  }
  if (transport === 'mailgun') {
    return new MailgunTransport({
      enabled: true,
      sender: mail.sender,
      domain: mail.mailgunDomain,
      apiKey: mail.mailgunApiKey,
    })
  }
  return new ZeaburZSendTransport({
    enabled: true,
    sender: mail.sender,
    host: mail.host,
    apiKey: mail.apiKey,
  })
}
