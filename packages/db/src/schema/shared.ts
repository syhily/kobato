// Shared column enums. SQLite has no CREATE TYPE — `text({ enum })`
// constrains at the app layer, and drizzle-kit emits a CHECK into the
// migration SQL (DB-perimeter guard). Per-domain persistence enums live in
// their owning schema module (`webmention.ts`, `notification.ts`, `job-run.ts`,
// `user.ts`, `storage-migration.ts`); their wire twins in `@kobato/contracts`
// are pinned by the server's db-wire parity test.

export const USER_ROLES = ['admin', 'author', 'visitor'] as const

// Newsletter double-opt-in lifecycle. `unsubscribed` rows are kept so a re-subscribe is a state transition on the same row.
export const NEWSLETTER_SUBSCRIBER_STATUSES = ['pending', 'confirmed', 'unsubscribed'] as const
