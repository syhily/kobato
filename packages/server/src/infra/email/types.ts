// Mail transport abstraction.
//
// The email layer previously hard-coded the Zeabur ZSend HTTP endpoint
// inside `sendEmail`. That locked the whole stack to a single vendor:
// self-hosters not running on Zeabur had to hand-roll a custom adapter
// just to send a password-reset mail. This file defines the seam every
// concrete transport (Zeabur, SMTP, Mailgun, future SES…) must
// implement so the registry in `sender.ts` can pick one at runtime.
//
// `EmailMessage` and `SendResult` live here (not in `sender.ts`) so a
// transport implementation never has to import the dispatcher — that
// keeps the dependency graph acyclic. Call sites import these types
// from here directly.

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
