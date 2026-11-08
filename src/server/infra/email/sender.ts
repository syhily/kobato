import { createHash } from 'node:crypto'

import type { MailTransport, SendOptions, SendResult } from '@/server/infra/email/types'
import type { ServerMessageId } from '@/shared/i18n/messages/server/en-US'

import { render } from '@/server/infra/email/render'
import AuthorInvite from '@/server/infra/email/templates/AuthorInvite'
import PasswordReset from '@/server/infra/email/templates/PasswordReset'
import SignInLink from '@/server/infra/email/templates/SignInLink'
import SignInOtp from '@/server/infra/email/templates/SignInOtp'
import { emailTranslator } from '@/server/infra/email/translator'
import { MailgunTransport } from '@/server/infra/email/transports/mailgun'
import { SmtpTransport } from '@/server/infra/email/transports/smtp'
import { getLogger } from '@/server/infra/logger'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { escapeHtml } from '@/shared/utils/security'

const log = getLogger('email')

// Mirrored from OTP_TTL_MS in verification-tokens.ts — keep in sync.
const OTP_TTL_MINUTES = 5
// Same mirror for the magic-link TTL (SIGNIN_LINK_TTL_MS).
const SIGNIN_LINK_TTL_MINUTES = 15

interface MailConfig {
  enabled: boolean
  notificationEmails: boolean
  sender: string
  transport: 'smtp' | 'mailgun'
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

// Senders only run behind the install gate, so the snapshot section is always present.
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

// One entry per transport: readiness check, missing-field message, builder.
// Adding a transport = one entry here + its `MailTransport` class.
interface TransportRegistryEntry {
  isReady(mail: MailConfig): boolean
  /** Catalog key for the "missing fields" readiness message (site locale). */
  unconfiguredKey: ServerMessageId
  build(mail: MailConfig, opts?: BuildTransportOptions): MailTransport
}

const TRANSPORT_REGISTRY: Record<MailConfig['transport'], TransportRegistryEntry> = {
  smtp: {
    isReady: (mail) => Boolean(mail.smtpHost && mail.smtpUser && mail.smtpPass && mail.sender),
    unconfiguredKey: 'email.error.smtpUnconfigured',
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
    unconfiguredKey: 'email.error.mailgunUnconfigured',
    build: (mail, opts) =>
      new MailgunTransport({
        enabled: opts?.forceEnabled ?? mail.enabled,
        sender: mail.sender,
        domain: mail.mailgunDomain,
        apiKey: mail.mailgunApiKey ?? '',
      }),
  },
}

// A snapshot from another build can hold an out-of-union `transport` — fall back to SMTP.
function resolveTransportEntry(mail: MailConfig): TransportRegistryEntry {
  const transport = mail.transport ?? 'smtp'
  const entry = (TRANSPORT_REGISTRY as Record<string, TransportRegistryEntry>)[transport]
  if (entry === undefined) {
    log.warn('Unknown mail transport, falling back to SMTP', { transport })
    return TRANSPORT_REGISTRY.smtp
  }
  return entry
}

// Single source of truth for "should this notification fire?" — shared with the admin test action.
export function checkMailReady(
  mail: MailConfig,
  options: CheckMailReadyOptions = {},
): { ready: true } | { ready: false; reason: 'disabled' | 'unconfigured'; message: string } {
  const t = emailTranslator()
  if (!options.ignoreEnabled && !mail.enabled) {
    return { ready: false, reason: 'disabled', message: t.format('email.error.disabled') }
  }
  const entry = resolveTransportEntry(mail)
  if (!entry.isReady(mail)) {
    return { ready: false, reason: 'unconfigured', message: t.format(entry.unconfiguredKey) }
  }
  return { ready: true }
}

interface InternalSendOptions {
  bcc?: string[]
}

let cachedTransport: { transport: MailTransport; fingerprint: string } | null = null

function computeMailFingerprint(mail: MailConfig): string {
  // Hash the config (not raw JSON) so credentials never sit in module memory.
  return createHash('sha256')
    .update(
      JSON.stringify({
        transport: mail.transport,
        enabled: mail.enabled,
        sender: mail.sender,
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

// Cache the transport while the config fingerprint is unchanged, so connection pools survive sends.
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

// BCC the inviter so admin actions stay on the audit trail.
export async function sendAuthorInvite(
  user: { name: string; email: string },
  link: string,
  inviterName: string,
  inviterEmail?: string,
): Promise<SendResult> {
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  const t = emailTranslator()
  const html = render(
    AuthorInvite({
      t,
      receiver: user.name,
      inviter: inviterName,
      link,
    }),
  )
  return sendEmail(user.email, t.format('email.authorInvite.subject', { siteTitle: siteIdentity.title }), html, {
    bcc: inviterEmail ? [inviterEmail] : undefined,
  })
}

export async function sendPasswordReset(user: { name: string; email: string }, link: string): Promise<SendResult> {
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  const t = emailTranslator()
  const html = render(
    PasswordReset({
      t,
      receiver: user.name,
      link,
    }),
  )
  return sendEmail(user.email, t.format('email.passwordReset.subject', { siteTitle: siteIdentity.title }), html)
}

export async function sendSignInOtp(user: { name: string; email: string }, otpCode: string): Promise<SendResult> {
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  const t = emailTranslator()
  const html = render(
    SignInOtp({
      t,
      receiver: user.name,
      otpCode,
      expiresMinutes: OTP_TTL_MINUTES,
    }),
  )
  return sendEmail(user.email, t.format('email.signInOtp.subject', { siteTitle: siteIdentity.title }), html)
}

export async function sendSignInLink(user: { name: string; email: string }, link: string): Promise<SendResult> {
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  const t = emailTranslator()
  const html = render(
    SignInLink({
      t,
      receiver: user.name,
      link,
      expiresMinutes: SIGNIN_LINK_TTL_MINUTES,
    }),
  )
  return sendEmail(user.email, t.format('email.signInLink.subject', { siteTitle: siteIdentity.title }), html)
}

// Test sends still respect the `unconfigured` guard.
export async function sendTestMail(to: string): Promise<SendResult> {
  const mail = readMailConfig()
  const ready = checkMailReady(mail, { ignoreEnabled: true })
  if (!ready.ready) {
    log.warn('Test mail skipped', { to, reason: ready.reason })
    return { ok: false, reason: ready.reason, message: ready.message }
  }

  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  const t = emailTranslator()
  const subject = t.format('email.testMail.subject', { siteTitle: siteIdentity.title })
  const sentAt = new Date().toISOString()
  // Plain body (no template render) — failures then isolate the transport.
  const html = [
    `<p>${t.format('email.testMail.introPrefix')}<strong>${escapeHtml(siteIdentity.title)}</strong>${t.format('email.testMail.introSuffix')}</p>`,
    `<p>${t.format('email.testMail.bodyOk')}</p>`,
    `<ul>`,
    `<li>${t.format('email.testMail.labelSite')}${escapeHtml(siteIdentity.website)}</li>`,
    `<li>${t.format('email.testMail.labelSender')}${escapeHtml(mail.sender)}</li>`,
    `<li>${t.format('email.testMail.labelTriggered')}${sentAt}</li>`,
    `</ul>`,
  ].join('\n')

  // Same transport as production, forced enabled, so editors can test before flipping the toggle.
  const transport = buildTransport(mail, { forceEnabled: true })
  try {
    return await transport.send({ to, subject, html })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.error('Test mail send failed: transport error', { to, error })
    return { ok: false, reason: 'network', message }
  }
}
