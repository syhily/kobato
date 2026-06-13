import { render } from '@/server/infra/email/render'
import AuthorInvite from '@/server/infra/email/templates/AuthorInvite'
import PasswordReset from '@/server/infra/email/templates/PasswordReset'
import SignInOtp from '@/server/infra/email/templates/SignInOtp'
import { getLogger } from '@/server/infra/logger'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { escapeHtml } from '@/shared/utils/security'

const log = getLogger('email')

// OTP TTL mirrored from auth domain so the email layer does not import
// a business domain. Kept in sync with OTP_TTL_MS in verification-tokens.ts.
const OTP_TTL_MINUTES = 5

export interface EmailMessage {
  to: string
  subject: string
  html: string
}

export type SendResult =
  | { ok: true }
  | { ok: false; reason: 'disabled' | 'unconfigured'; message: string }
  | { ok: false; reason: 'upstream'; status: number; message: string }
  | { ok: false; reason: 'network'; message: string }

interface MailConfig {
  enabled: boolean
  host: string
  apiKey: string
  sender: string
}

// Read the live mail slice straight from the snapshot. Mail senders only
// run from server-side code paths that already sit behind the install
// gate, so `requireBlogSettingsSection()` is the right call — a `null`
// here would be a regression in the gate, not a runtime mode we need to
// support.
function readMailConfig(): MailConfig {
  return requireBlogSettingsSection('mail').mail
}

// Single source of truth for "should this notification actually fire?"
// — used both internally by the comment-fired senders below and by the
// admin "send test" action so the UI can surface the same skip reason.
export function checkMailReady(
  mail: MailConfig,
): { ready: true } | { ready: false; reason: 'disabled' | 'unconfigured'; message: string } {
  if (!mail.enabled) {
    return { ready: false, reason: 'disabled', message: '邮件发送已在管理面板中关闭' }
  }
  if (!mail.host || !mail.apiKey || !mail.sender) {
    return {
      ready: false,
      reason: 'unconfigured',
      message: '邮件服务尚未配置完整（缺少 Host / API Key / 发件人）',
    }
  }
  return { ready: true }
}

interface InternalSendOptions {
  /** Optional BCC list. Used by admin-author-invite to keep the inviter on the audit trail. */
  bcc?: string[]
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  options: InternalSendOptions = {},
): Promise<SendResult> {
  const mail = readMailConfig()
  const ready = checkMailReady(mail)
  if (!ready.ready) {
    // Skip path used to be an `error`-level log because the only way
    // to land here was a misconfigured deployment. Now that an editor
    // can intentionally pause notifications, the disabled branch is
    // demoted to `debug` and the unconfigured branch stays `warn` so
    // it's still visible in CI / production logs.
    if (ready.reason === 'disabled') {
      log.debug('Mail send skipped: disabled', { to, subject })
    } else {
      log.warn('Mail send skipped: unconfigured', { to, subject })
    }
    return { ok: false, reason: ready.reason, message: ready.message }
  }

  const url = `https://${mail.host}/api/v1/zsend/emails`
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mail.apiKey}`,
      },
      body: JSON.stringify({
        from: mail.sender,
        to: [to],
        ...(options.bcc && options.bcc.length > 0 ? { bcc: options.bcc } : {}),
        subject,
        html,
      }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.error('Mail send failed: network error', { to, subject, error })
    return { ok: false, reason: 'network', message }
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    log.error('Mail send failed: upstream rejected', {
      status: response.status,
      statusText: response.statusText,
      body,
      to,
      subject,
    })
    return {
      ok: false,
      reason: 'upstream',
      status: response.status,
      message: `${response.status} ${response.statusText}`,
    }
  }
  return { ok: true }
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
// to Zeabur with an empty key.
export async function sendTestMail(to: string): Promise<SendResult> {
  const mail = readMailConfig()
  if (!mail.host || !mail.apiKey || !mail.sender) {
    log.warn('Test mail skipped: unconfigured', { to })
    return {
      ok: false,
      reason: 'unconfigured',
      message: '邮件服务尚未配置完整（缺少 Host / API Key / 发件人）',
    }
  }

  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  const subject = `【${siteIdentity.title}】管理员邮件测试`
  const sentAt = new Date().toISOString()
  // Keep the test body intentionally plain (no React Email render) so a
  // failure here points at the SMTP/HTTP plumbing rather than the
  // template renderer.
  const html = [
    `<p>这是一封来自 <strong>${escapeHtml(siteIdentity.title)}</strong> 后台的邮件发送测试。</p>`,
    `<p>如果你收到了这封邮件，说明 Zeabur ZSend 配置工作正常。</p>`,
    `<ul>`,
    `<li>站点：${escapeHtml(siteIdentity.website)}</li>`,
    `<li>发件人：${escapeHtml(mail.sender)}</li>`,
    `<li>触发时间（UTC）：${sentAt}</li>`,
    `</ul>`,
  ].join('\n')

  // Send through a direct fetch instead of `sendEmail` so we report
  // the upstream status verbatim — the admin UI surfaces it for
  // troubleshooting.
  const url = `https://${mail.host}/api/v1/zsend/emails`
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mail.apiKey}`,
      },
      body: JSON.stringify({ from: mail.sender, to: [to], subject, html }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.error('Test mail send failed: network error', { to, error })
    return { ok: false, reason: 'network', message }
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    log.error('Test mail send failed: upstream rejected', {
      status: response.status,
      statusText: response.statusText,
      body,
      to,
    })
    return {
      ok: false,
      reason: 'upstream',
      status: response.status,
      message: `${response.status} ${response.statusText}`,
    }
  }
  return { ok: true }
}
