// The seam every concrete transport (Zeabur, SMTP, Mailgun, …) implements;
// the registry in `sender.ts` picks one at runtime. Types live here so
// transports never import the dispatcher (acyclic graph).

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
  /** Optional BCC list. Used by admin-author-invite to keep the inviter on the audit trail. */
  bcc?: string[]
}

export interface MailTransport {
  readonly name: string
  send(message: EmailMessage, options?: SendOptions): Promise<SendResult>
}
