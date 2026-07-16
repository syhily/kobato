import { pgEnum } from 'drizzle-orm/pg-core'

export const userRoleEnum = pgEnum('user_role', ['admin', 'author', 'visitor'])

// Newsletter double-opt-in lifecycle. `pending` rows have only been asked
// to confirm; `confirmed` rows receive mail; `unsubscribed` rows are kept
// (not deleted) so one-click unsubscribe stays idempotent and a later
// re-subscribe is a state transition on the same row.
export const newsletterSubscriberStatusEnum = pgEnum('newsletter_subscriber_status', [
  'pending',
  'confirmed',
  'unsubscribed',
])
