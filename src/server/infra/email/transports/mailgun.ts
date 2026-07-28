// Mailgun transport.
//
// Talks to the Mailgun v3 API directly with native `fetch` + `FormData` —
// the official `mailgun.js` SDK was a thin wrapper around exactly this one
// multipart POST, so the SDK (and its axios/form-data dependency tree) is
// gone. Mirrors `zeabur-zsend.ts` line-by-line for skip / send /
// error-classification behaviour so every HTTP-based transport speaks the
// same vocabulary.
//
//   - `disabled` short-circuits with a debug log.
//   - missing domain / apiKey / sender short-circuits with `unconfigured`.
//   - upstream non-2xx surfaces as `reason=upstream` with the status.
//   - fetch throw (DNS / TCP / timeout) surfaces as `reason=network`.
//
// US region only — the endpoint is hardcoded to `https://api.mailgun.net`.
// EU customers would need `https://api.eu.mailgun.net`; the admin UI does
// not expose a region selector.

import type {
  EmailMessage,
  MailTransport,
  MailTransportConfig,
  SendOptions,
  SendResult,
} from '@/server/infra/email/types'

import { getLogger } from '@/server/infra/logger'

const log = getLogger('email')

export interface MailgunConfig extends MailTransportConfig {
  domain: string
  apiKey: string
}

export class MailgunTransport implements MailTransport {
  readonly name = 'mailgun'

  constructor(private readonly config: MailgunConfig) {}

  async send(message: EmailMessage, options: SendOptions = {}): Promise<SendResult> {
    const { enabled, domain, apiKey, sender } = this.config

    if (!enabled) {
      log.debug('Mailgun send skipped: disabled', { to: message.to, subject: message.subject })
      return { ok: false, reason: 'disabled', message: '邮件发送已在管理面板中关闭' }
    }
    if (!domain || !apiKey || !sender) {
      log.warn('Mailgun send skipped: unconfigured', { to: message.to, subject: message.subject })
      return {
        ok: false,
        reason: 'unconfigured',
        message: 'Mailgun 服务尚未配置完整（缺少 Domain / API Key / 发件人）',
      }
    }

    const { to, subject, html } = message
    const body = new FormData()
    body.append('from', sender)
    body.append('to', to)
    if (options.bcc) {
      for (const recipient of options.bcc) {
        body.append('bcc', recipient)
      }
    }
    body.append('subject', subject)
    body.append('html', html)

    let response: Response
    try {
      response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
        },
        body,
        signal: AbortSignal.timeout(30_000),
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      log.error('Mailgun send failed: network error', { to, subject, error })
      return { ok: false, reason: 'network', message: errorMessage }
    }

    if (!response.ok) {
      const responseBody = await response.text().catch(() => '')
      log.error('Mailgun send failed: upstream rejected', {
        status: response.status,
        statusText: response.statusText,
        body: responseBody,
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
}
