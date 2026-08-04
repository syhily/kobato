import type { MailTransport, SendOptions, SendResult } from '@kobato/server/infra/email/types'

import { render } from '@kobato/server/infra/email/render'
import AuthorInvite from '@kobato/server/infra/email/templates/AuthorInvite'
import PasswordReset from '@kobato/server/infra/email/templates/PasswordReset'
import SignInLink from '@kobato/server/infra/email/templates/SignInLink'
import SignInOtp from '@kobato/server/infra/email/templates/SignInOtp'
import { MailgunTransport } from '@kobato/server/infra/email/transports/mailgun'
import { SmtpTransport } from '@kobato/server/infra/email/transports/smtp'
import { ZeaburZSendTransport } from '@kobato/server/infra/email/transports/zeabur-zsend'
import { getLogger } from '@kobato/server/infra/logger'
import { requireBlogSettingsSection } from '@kobato/shared/config/getters'
import { escapeHtml } from '@kobato/shared/utils/security'
import { createHash } from 'node:crypto'

const log = getLogger('email')

// OTP TTL mirrored from auth domain so the email layer does not import
// a business domain. Kept in sync with OTP_TTL_MS in verification-tokens.ts.
const OTP_TTL_MINUTES = 5
// Same mirror for the magic-link TTL (SIGNIN_LINK_TTL_MS).
const SIGNIN_LINK_TTL_MINUTES = 15

interface MailConfig {
  enabled: boolean
  host: string
  apiKey?: string | undefined
  sender: string
  transport: 'zeabur' | 'smtp' | 'mailgun'
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass?: string | undefined
  smtpSecure: boolean
  smtpRequireTls: boolean
  smtpRejectUnauthorized: boolean
  mailgunDomain: string
  mailgunApiKey?: string | undefined
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

interface BuildTransportOptions {
  /** Test sends bypass the master switch so editors can verify connectivity first. */
  forceEnabled?: boolean
}

// One registry entry per transport: which mail fields it needs before a
// send can succeed, the user-facing message when they are missing, and
// how to build it. `checkMailReady` and `buildTransport` are pure table
// lookups over this — adding a transport is one entry here plus its
// `MailTransport` class.
interface TransportRegistryEntry {
  isReady(mail: MailConfig): boolean
  unconfiguredMessage: string
  build(mail: MailConfig, opts?: BuildTransportOptions): MailTransport
}

const TRANSPORT_REGISTRY: Record<MailConfig['transport'], TransportRegistryEntry> = {
  zeabur: {
    isReady: (mail) => Boolean(mail.host && mail.apiKey && mail.sender),
    unconfiguredMessage: 'Zeabur 邮件服务尚未配置完整（缺少 Host / API Key / 发件人）',
    build: (mail, opts) =>
      new ZeaburZSendTransport({
        enabled: opts?.forceEnabled ?? mail.enabled,
        sender: mail.sender,
        host: mail.host,
        apiKey: mail.apiKey ?? '',
      }),
  },
  smtp: {
    isReady: (mail) => Boolean(mail.smtpHost && mail.smtpUser && mail.smtpPass && mail.sender),
    unconfiguredMessage: 'SMTP 服务尚未配置完整（缺少服务器地址 / 用户名 / 密码 / 发件人）',
    build: (mail, opts) =>
      new SmtpTransport({
        enabled: opts?.forceEnabled ?? mail.enabled,
        sender: mail.sender,
        host: mail.smtpHost,
        port: mail.smtpPort,
        user: mail.smtpUser,
        pass: mail.smtpPass ?? '',
        secure: mail.smtpSecure,
        requireTls: mail.smtpRequireTls,
        rejectUnauthorized: mail.smtpRejectUnauthorized,
      }),
  },
  mailgun: {
    isReady: (mail) => Boolean(mail.mailgunDomain && mail.mailgunApiKey && mail.sender),
    unconfiguredMessage: 'Mailgun 服务尚未配置完整（缺少 Domain / API Key / 发件人）',
    build: (mail, opts) =>
      new MailgunTransport({
        enabled: opts?.forceEnabled ?? mail.enabled,
        sender: mail.sender,
        domain: mail.mailgunDomain,
        apiKey: mail.mailgunApiKey ?? '',
      }),
  },
}

// The `mail.transport` column is typed as a union, but a settings
// snapshot written by an older/newer build can still hold an
// out-of-union value — fall back to Zeabur like the dispatcher always
// has. The widening cast exists precisely for that runtime case.
function resolveTransportEntry(mail: MailConfig): TransportRegistryEntry {
  const transport = mail.transport ?? 'zeabur'
  const entry = (TRANSPORT_REGISTRY as Record<string, TransportRegistryEntry>)[transport]
  if (entry === undefined) {
    log.warn('Unknown mail transport, falling back to Zeabur ZSend', { transport })
    return TRANSPORT_REGISTRY.zeabur
  }
  return entry
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
  const entry = resolveTransportEntry(mail)
  if (!entry.isReady(mail)) {
    return { ready: false, reason: 'unconfigured', message: entry.unconfiguredMessage }
  }
  return { ready: true }
}

interface InternalSendOptions {
  /** Optional BCC list. Used by admin-author-invite to keep the inviter on the audit trail. */
  bcc?: string[]
}

let cachedTransport: { transport: MailTransport; fingerprint: string } | null = null

function computeMailFingerprint(mail: MailConfig): string {
  // Hash the config material rather than caching the JSON itself: the
  // fingerprint sits in module memory next to the transport for the
  // process lifetime, and the plain JSON would retain raw credentials
  // (apiKey, mailgunApiKey, smtpPass) alongside it. Equality semantics
  // are unchanged. All transport-shaping fields are included so any
  // config drift rebuilds the transport.
  return createHash('sha256')
    .update(
      JSON.stringify({
        transport: mail.transport,
        enabled: mail.enabled,
        sender: mail.sender,
        host: mail.host,
        apiKey: mail.apiKey,
        smtpHost: mail.smtpHost,
        smtpPort: mail.smtpPort,
        smtpUser: mail.smtpUser,
        smtpPass: mail.smtpPass,
        smtpSecure: mail.smtpSecure,
        smtpRequireTls: mail.smtpRequireTls,
        smtpRejectUnauthorized: mail.smtpRejectUnauthorized,
        mailgunDomain: mail.mailgunDomain,
        mailgunApiKey: mail.mailgunApiKey,
      }),
    )
    .digest('hex')
}

export function invalidateMailTransportCache(): void {
  cachedTransport = null
}

// Resolve the live transport from the configured mail slice.
// The transport is cached and reused while the mail config fingerprint
// stays the same, so SMTP connection pools and Mailgun clients survive
// across individual notification sends.
function getTransport(): MailTransport {
  const mail = readMailConfig()
  const fingerprint = computeMailFingerprint(mail)
  if (cachedTransport?.fingerprint === fingerprint) {
    return cachedTransport.transport
  }
  const transport = buildTransport(mail)
  cachedTransport = { transport, fingerprint }
  return transport
}

function buildTransport(mail: MailConfig, opts: BuildTransportOptions = {}): MailTransport {
  return resolveTransportEntry(mail).build(mail, opts)
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
  const html = render(
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
  const html = render(
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
  const html = render(
    SignInOtp({
      receiver: user.name,
      otpCode,
      expiresMinutes: OTP_TTL_MINUTES,
    }),
  )
  return sendEmail(user.email, `【${siteIdentity.title}】登录验证码`, html)
}

// Sent when a user whose login method is magic-link asks to sign in.
export async function sendSignInLink(user: { name: string; email: string }, link: string): Promise<SendResult> {
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  const html = render(
    SignInLink({
      receiver: user.name,
      link,
      expiresMinutes: SIGNIN_LINK_TTL_MINUTES,
    }),
  )
  return sendEmail(user.email, `【${siteIdentity.title}】登录链接`, html)
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
  const transport = buildTransport(mail, { forceEnabled: true })
  try {
    return await transport.send({ to, subject, html })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.error('Test mail send failed: transport error', { to, error })
    return { ok: false, reason: 'network', message }
  }
}
