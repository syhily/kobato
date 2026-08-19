// Shared column enums. SQLite has no CREATE TYPE — `text({ enum })`
// constrains at the app layer, and drizzle-kit emits a CHECK into the
// migration SQL (DB-perimeter guard). The webmention lists are NOT here —
// their canonical home is `@/shared/contracts/webmentions` (single source
// for the drizzle columns, the CHECK literals, and the zod enums).

export const USER_ROLES = ['admin', 'author', 'visitor'] as const

// Newsletter double-opt-in lifecycle. `unsubscribed` rows are kept so a re-subscribe is a state transition on the same row.
export const NEWSLETTER_SUBSCRIBER_STATUSES = ['pending', 'confirmed', 'unsubscribed'] as const
