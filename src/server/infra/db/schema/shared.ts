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
// moderation decision stays auditable; `hidden` is the automatic
// terminal-ish state a displayed mention lands in after 7 consecutive
// daily re-verification failures — it leaves the public page, is
// excluded from further daily re-verification, and only a successful
// manual re-verification by the admin restores it to `approved`.
export const WEBMENTION_STATUSES = ['pending', 'approved', 'rejected', 'hidden'] as const

// Webmention source verification state (receive-time verification and
// the daily re-verification cycle). `verified` means the last check
// confirmed the source document links to the target; `failed` carries
// the last failure message in `last_error` for the admin UI tooltip.
export const WEBMENTION_VERIFY_STATUSES = ['verified', 'failed'] as const

// Webmention response type (W3C / IndieWeb classification, async-inbox
// design — docs/plans/2026-08-02-webmention-async-inbox-design.md):
// detected from microformats2 class markers on the source
// anchor (`u-in-reply-to` / `u-repost-of` / `u-like-of`) — a source with
// no recognized marker is a plain `mention`. The type is presentational
// grouping only; moderation and verification treat every type alike.
export const WEBMENTION_TYPES = ['mention', 'reply', 'like', 'repost'] as const

// Webmention send lifecycle (outbound mirror of the receive side above).
// `pending` rows await endpoint discovery or (re)send; `sent` /
// `no-endpoint` / `failed` are terminal — kept, not deleted, because the
// row IS the send log. A republish resets `no-endpoint` / `failed` rows
// back to `pending`, but never `sent` (repeat-bombing guard).
export const WEBMENTION_OUTBOX_STATUSES = ['pending', 'sent', 'no-endpoint', 'failed'] as const
