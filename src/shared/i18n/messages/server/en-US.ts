// Server-only messages (email, notifications, background jobs). These never
// enter the client bundle: the root loader ships `UiMessages` only.
//
// `email.*` keys are not persisted — they may be renamed as templates evolve.
// `notification.*` keys, once a producer writes them into a notification row,
// are append-only (rename/delete breaks rendering of rows already stored).

export const serverMessagesEnUS = {
  'email.common.automaticNotice': 'This email was sent automatically. Replies are not monitored.',
  'email.common.copyright': '{siteTitle} © {year}',
  'email.common.greeting': 'Hello {receiver},',
} as const

export type ServerMessageId = keyof typeof serverMessagesEnUS

export type ServerMessages = Record<ServerMessageId, string>
