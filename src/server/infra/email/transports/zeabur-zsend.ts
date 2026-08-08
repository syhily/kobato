// Zeabur ZSend transport: `POST https://<host>/api/v1/zsend/emails` with
// `Bearer <apiKey>`, 30s abort timeout, JSON body.

import type {
  EmailMessage,
  MailTransport,
  MailTransportConfig,
  SendOptions,
  SendResult,
} from '@/server/infra/email/types'

import { getLogger } from '@/server/infra/logger'

const log = getLogger('email')

export interface ZeaburConfig extends MailTransportConfig {
  host: string
  apiKey: string
}

export class ZeaburZSendTransport implements MailTransport {
  readonly name = 'zeabur-zsend'

  constructor(private readonly config: ZeaburConfig) {}

  async send(message: EmailMessage, options: SendOptions = {}): Promise<SendResult> {
    const { enabled, host, apiKey, sender } = this.config

    if (!enabled) {
      log.debug('Mail send skipped: disabled', { to: message.to, subject: message.subject })
      return { ok: false, reason: 'disabled', message: '邮件发送已在管理面板中关闭' }
    }
    if (!host || !apiKey || !sender) {
      log.warn('Mail send skipped: unconfigured', { to: message.to, subject: message.subject })
      return {
        ok: false,
        reason: 'unconfigured',
        message: '邮件服务尚未配置完整（缺少 Host / API Key / 发件人）',
      }
    }

    const url = `https://${host}/api/v1/zsend/emails`
    const { to, subject, html } = message
    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from: sender,
          to: [to],
          ...(options.bcc && options.bcc.length > 0 ? { bcc: options.bcc } : {}),
          subject,
          html,
        }),
        signal: AbortSignal.timeout(30_000),
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      log.error('Mail send failed: network error', { to, subject, error })
      return { ok: false, reason: 'network', message: errorMessage }
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
}
