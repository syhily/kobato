// Direct Mailgun v3 `fetch` + `FormData` client (no SDK dependency), sharing the
// other transports' skip/error vocabulary. US region only — endpoint is hardcoded
// to `https://api.mailgun.net`; the admin UI has no region selector.

import type {
  EmailMessage,
  MailTransport,
  MailTransportConfig,
  SendOptions,
  SendResult,
} from '@/server/infra/email/types'

import { emailTranslator } from '@/server/infra/email/translator'
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
    const t = emailTranslator()

    if (!enabled) {
      log.debug('Mailgun send skipped: disabled', { to: message.to, subject: message.subject })
      return { ok: false, reason: 'disabled', message: t.format('email.error.disabled') }
    }
    if (!domain || !apiKey || !sender) {
      log.warn('Mailgun send skipped: unconfigured', { to: message.to, subject: message.subject })
      return {
        ok: false,
        reason: 'unconfigured',
        message: t.format('email.error.mailgunUnconfigured'),
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
