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

export interface MailTransportConfig {
  enabled: boolean
  sender: string
}

export interface SendOptions {
  bcc?: string[]
}

export interface MailTransport {
  readonly name: string
  send(message: EmailMessage, options?: SendOptions): Promise<SendResult>
}
