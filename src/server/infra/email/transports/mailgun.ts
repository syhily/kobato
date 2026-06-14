// Mailgun transport.
//
// Wraps the official `mailgun.js` SDK behind the same `MailTransport`
// interface the Zeabur and SMTP transports implement, so the dispatcher
// in `sender.ts` can route to it with no special-casing. Mirrors
// `zebaur-zsend.ts` line-by-line for skip / send / error-classification
// behaviour so every HTTP-based transport speaks the same vocabulary.
//
//   - `disabled` short-circuits with a debug log.
//   - missing domain / apiKey / sender short-circuits with `unconfigured`.
//   - SDK throws an `APIError` (carrying `.status`) on a non-2xx upstream
//     response — surfaced as `reason=upstream` with the status.
//   - any other throw (DNS / TCP / timeout) surfaces as `reason=network`.
//
// US region only — `mailgun.client` defaults to `https://api.mailgun.net`.
// EU customers would need to pass `url: 'https://api.eu.mailgun.net'` to
// the client constructor; the admin UI does not expose a region selector.

import Mailgun from 'mailgun.js'

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

  private readonly client: ReturnType<Mailgun['client']>

  constructor(private readonly config: MailgunConfig) {
    const mg = new Mailgun(FormData)
    this.client = mg.client({ username: 'api', key: config.apiKey })
  }

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

    try {
      await this.client.messages.create(domain, {
        from: sender,
        to: [message.to],
        ...(options.bcc && options.bcc.length > 0 ? { bcc: options.bcc } : {}),
        subject: message.subject,
        html: message.html,
      })
      return { ok: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      // `mailgun.js` throws an `APIError` that carries `.status` on any
      // non-2xx upstream response; everything else (DNS, TCP, timeout)
      // is a plain Error we classify as `network`.
      if (error !== null && typeof error === 'object' && 'status' in error && typeof error.status === 'number') {
        const status = error.status
        log.error('Mailgun send failed: upstream rejected', {
          status,
          to: message.to,
          subject: message.subject,
          error,
        })
        return {
          ok: false,
          reason: 'upstream',
          status,
          message: `${status} ${errorMessage}`,
        }
      }
      log.error('Mailgun send failed: network error', { to: message.to, subject: message.subject, error })
      return { ok: false, reason: 'network', message: errorMessage }
    }
  }
}
