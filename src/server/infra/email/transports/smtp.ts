// SMTP transport via `nodemailer` for self-hosters; the registry in `sender.ts`
// routes here when `mail.transport === 'smtp'`. Shares the other transports'
// skip/error vocabulary. Deferred: OAuth2, pooling config, DKIM/SPF helpers.

import nodemailer, { type Transporter } from 'nodemailer'

import type {
  EmailMessage,
  MailTransport,
  MailTransportConfig,
  SendOptions,
  SendResult,
} from '@/server/infra/email/types'

import { getLogger } from '@/server/infra/logger'

const log = getLogger('email')

export interface SmtpConfig extends MailTransportConfig {
  host: string
  port: number
  user: string
  pass: string
  secure?: boolean
  requireTls?: boolean
  rejectUnauthorized?: boolean
}

export class SmtpTransport implements MailTransport {
  readonly name = 'smtp'

  private readonly transporter: Transporter

  constructor(private readonly config: SmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure ?? config.port === 465,
      requireTLS: config.requireTls ?? true,
      tls: {
        rejectUnauthorized: config.rejectUnauthorized ?? true,
      },
      auth: { user: config.user, pass: config.pass },
    })
  }

  async send(message: EmailMessage, options: SendOptions = {}): Promise<SendResult> {
    const { enabled, host, user, pass, sender } = this.config

    if (!enabled) {
      log.debug('SMTP mail send skipped: disabled', { to: message.to, subject: message.subject })
      return { ok: false, reason: 'disabled', message: '邮件发送已在管理面板中关闭' }
    }
    if (!host || !user || !pass || !sender) {
      log.warn('SMTP mail send skipped: unconfigured', { to: message.to, subject: message.subject })
      return {
        ok: false,
        reason: 'unconfigured',
        message: 'SMTP 服务尚未配置完整（缺少 Host / 用户名 / 密码 / 发件人）',
      }
    }

    try {
      await this.transporter.sendMail({
        from: sender,
        to: message.to,
        ...(options.bcc && options.bcc.length > 0 ? { bcc: options.bcc } : {}),
        subject: message.subject,
        html: message.html,
      })
      return { ok: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      log.error('SMTP mail send failed', { to: message.to, subject: message.subject, error })
      return { ok: false, reason: 'network', message: errorMessage }
    }
  }
}
