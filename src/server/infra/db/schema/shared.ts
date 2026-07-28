// Shared column enums. SQLite has no CREATE TYPE — drizzle's
// `text({ enum })` constrains at the schema/application layer (and
// drizzle-kit emits a CHECK constraint into the migration SQL, so a
// stray `UPDATE user SET role = 'editor'` from a DB client is still
// rejected at the DB perimeter).

export const USER_ROLES = ['admin', 'author', 'visitor'] as const

// Newsletter double-opt-in lifecycle. `pending` rows have only been asked
// to confirm; `confirmed` rows receive mail; `unsubscribed` rows are kept
// (not deleted) so one-click unsubscribe stays idempotent and a later
// re-subscribe is a state transition on the same row.
export const NEWSLETTER_SUBSCRIBER_STATUSES = ['pending', 'confirmed', 'unsubscribed'] as const

// Webmention moderation lifecycle. `pending` rows have been verified
// (source links to target) but await admin review; `approved` rows are
// cleared for display; `rejected` rows are kept (not deleted) so the
// moderation decision stays auditable.
export const WEBMENTION_STATUSES = ['pending', 'approved', 'rejected'] as const
