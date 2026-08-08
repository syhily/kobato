// Shared column enums. SQLite has no CREATE TYPE — `text({ enum })`
// constrains at the app layer, and drizzle-kit emits a CHECK into the
// migration SQL (DB-perimeter guard).

export const USER_ROLES = ['admin', 'author', 'visitor'] as const

// Newsletter double-opt-in lifecycle. `unsubscribed` rows are kept so a re-subscribe is a state transition on the same row.
export const NEWSLETTER_SUBSCRIBER_STATUSES = ['pending', 'confirmed', 'unsubscribed'] as const

// Webmention moderation lifecycle: `pending` rows await admin review;
// `rejected` rows are kept (auditable). `hidden` follows 7 consecutive
// daily re-verification failures — only a manual re-verification restores `approved`.
export const WEBMENTION_STATUSES = ['pending', 'approved', 'rejected', 'hidden'] as const

// Webmention source verification state: `failed` carries the last failure message in `last_error`.
export const WEBMENTION_VERIFY_STATUSES = ['verified', 'failed'] as const

// Webmention response type (W3C / IndieWeb mf2 classification —
// docs/plans/2026-08-02-webmention-async-inbox-design.md): detected from
// `u-in-reply-to` / `u-repost-of` / `u-like-of` markers, no marker = `mention`;
// presentational grouping only, moderation and verification treat all types alike.
export const WEBMENTION_TYPES = ['mention', 'reply', 'like', 'repost'] as const

// Webmention send lifecycle: `sent` / `no-endpoint` / `failed` are terminal and kept (the row IS the send log);
// a republish resets `no-endpoint` / `failed` back to `pending`, but never `sent`.
export const WEBMENTION_OUTBOX_STATUSES = ['pending', 'sent', 'no-endpoint', 'failed'] as const
