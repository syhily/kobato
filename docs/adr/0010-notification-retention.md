# ADR-0010: Notification retention — prune READ messages after 180 days

- Status: accepted
- Date: 2026-11-07
- Amended: 2026-11-07 (plan 028 — implemented as specified)

## Context

`notification` and `notification_recipient` are the only user-data tables in
the content DB with no retention story. Nothing in `src/` deletes from
either table, recall is a soft delete that keeps rows by design (ADR-0007),
and the backup archive ships the whole content DB — so every message and
every fan-out row is permanent by construction.

Facts verified against the live tree at `9cc23d0f`:

- Data model (`src/server/infra/db/schema/notification.ts`): `notification`
  holds one row per message (id, threadId, kind, senderId, title, body,
  replyable, source, actionUrl, createdAt, recalledAt); `notification_recipient`
  holds one row per (message, user) with `read_at` NULL = unread. Broadcast
  fan-out writes one recipient row per active user, so the recipient table
  grows O(messages × users) while the message table grows linearly.
- Recall (ADR-0007) sets `notification.recalled_at` and every read path
  filters `recalled_at IS NULL`; the rows themselves stay, because the audit
  story and recall reversal both depend on them. Recall bounds what users
  SEE, not what the database stores.
- Backups: the archive is a gzipped tar of the raw `kobato.db` — every
  message ever sent is in every archive. Pruning is the only lever that
  stops the archives from carrying the full history forever.
- Maintenance precedent (`src/server/infra/db/maintenance.ts`):
  `runDbMaintenance` runs daily (04:30 site time) — `PRAGMA
  incremental_vacuum`, `PRAGMA optimize`, and `pruneJobRuns` (30 days AND the
  newest 200 rows per task, one sync transaction returning a count), all
  logged in a single info line. The audit log has its own configurable DB
  retention (`limits.auditLogDbRetentionDays`, default 30 days; 180-day
  archive retention).
- The closest existing "user-data lifetime" number: DuckDB access events are
  kept 180 days — `ACCESS_EVENTS_RETENTION_DAYS` in
  `src/server/domains/analytics/services/access-log.ts`, fixed by design, not
  a setting.
- Age must come from the MESSAGE, not the recipient row: `read_at` is the
  only recipient timestamp that carries meaning (a message read late is
  still an old message), and plan 017 drops `notification_recipient.created_at`
  entirely. Any prune predicate that reads a recipient-side timestamp would
  break on that migration.

## Options

**1. No retention (status quo).** Be honest about the cost: the DB and every
backup archive grow linearly in messages × users, and nothing ever reclaims a
row. For a small install this is acceptable — the inbox is the product's
memory, and users do expect old announcements to stay visible. But there is
also no lever if an install grows, and "delete nothing, forever" is not a
policy so much as the absence of one.

**2. Time-based prune of READ recipient rows (recommended).** Delete
recipient rows that are READ and whose message is older than N days. Unread
rows are NEVER pruned: deleting an unread message silently destroys user
state — the badge shrinks, the drawer never showed it, and the user has no
way to know what they missed. Orphan roots (no remaining recipient rows, and
recalled OR older than N) are reclaimed in the same pass. N = 180 days,
matching the analytics lifetime — the number this repo already treats as "how
long user data lives". Runs inside `runDbMaintenance` beside `pruneJobRuns`,
with counts in the same log line.

**3. Cap per user (newest K rows per user).** Simpler to explain ("the inbox
holds at most K items") and bounds growth regardless of age. Rejected for the
same reason as pruning unread rows: once a user passes K, the oldest unread
messages are deleted first — the exact harm option 2 refuses. Making the cap
respect read state needs the same predicate as option 2, so it is not even
simpler SQL, only simpler copy.

**4. Settings-driven window.** Option 2 with `limits.notificationRetentionDays`
following the audit-retention precedent. Rejected for now: the repo's settings
surface stays deliberately small, and an operator who never opens the settings
page should still get a bounded database. This can be added later without
changing the predicate — the window is one constant away from being a config
read.

## Decision

Adopt option 2. A `pruneNotifications(db, now)` operation in
`src/server/infra/db/operations/` (same shape as `pruneJobRuns`: one sync
transaction, returns the deleted-row count), called from `runDbMaintenance`
after `pruneJobRuns`, with a hardcoded `NOTIFICATION_RETENTION_DAYS = 180`.

The pass runs two DELETEs:

1. **Read recipient rows past the window.** `notification_recipient` rows
   where `read_at IS NOT NULL` and the joined `notification.created_at` is
   older than `now - 180 days`. Age is always the message's `created_at`
   through the join — never a recipient-side column (see the plan-017 note
   above). This is a message-age window, not a dwell window: a row read on
   day 179 is pruned on day 181.
2. **Orphan roots.** `notification` rows with no remaining recipient row AND
   (`recalled_at IS NOT NULL` OR `created_at` older than the cutoff). The
   recalled branch answers one half of ADR-0007's open question about system
   alerts aging out: a recalled message whose fan-out rows are gone is dead
   weight. The age branch is what lets the message table itself shrink — it
   reclaims every aged message whose recipients all aged out in step 1,
   including ones that were never visible to anyone (zero recipients at send
   time, e.g. every targeted user was already deleted).

No new setting, no UI, no admin procedure, no audit event: this is
maintenance, not an operator action. The counts (`notificationRecipientsPruned`,
`notificationsPruned`) join the existing maintenance info log.

## Consequences

- Audit-log `resourceId` dangles for pruned rows. ADR-0007 accepted exactly
  this trade for recalled rows — "the audit story survives" because the audit
  row records who did what and when; the target's existence was never the
  evidence. In practice most references are already gone before a prune: the
  audit DB retention defaults to 30 days, versus this ADR's 180.
- Pruned rows are not gone from every copy: a backup taken before the prune
  still carries them, and restoring it revives them in the inbox. The next
  maintenance run prunes them again (they are past the window by definition).
  Documented and accepted — suppressing it with a tombstone would mean keeping
  exactly the rows the prune exists to remove.
- Unread rows are unbounded by construction. A broadcast nobody opens stays
  forever. So does a RECALLED broadcast whose recipients never read it: recall
  removes it from every read path, so no one can mark it read, so its rows
  never become prunable. That is the honest price of "never destroy user
  state"; see Open questions for the one case worth revisiting.
- Read-path cost does not move. ADR-0009's tuned polling counts unread rows
  via `idx_notification_recipient_user (user_id, read_at)`; this ADR never
  deletes unread rows, and removing read rows only shrinks that index.
- The sweep is one full pass per day. Both recipient indexes are user-scoped,
  so neither serves a global "old read rows" scan: the first pass is a scan +
  join. At realistic volumes (well under 10⁵ recipient rows) that is
  milliseconds inside a job that already runs `incremental_vacuum`. If an
  install outgrows it, the fix is an index on `notification(created_at)` — not
  batching in application code.
- No schema change, so backup/restore, migrations, and the SEA bundle are
  untouched; the feature is pure operations code behind the existing daily job.

## Open questions

- **Recalled-but-unread rows.** The unread guarantee protects state the user
  can still act on. A recalled message is filtered out of every read path, so
  the guarantee protects nothing there and instead immortalizes the rows. A
  follow-up could exempt recalled messages from the unread rule; that is a
  policy amendment and needs the maintainer's sign-off, so it is NOT decided
  here.
- **Soft-deleted users' unread rows.** A soft-deleted account can never sign
  in to read them, so its unread rows are immortal under the same rule. Not
  decided here (the recipient table has no FK cascade to prune them either).
- **Whether the window should ever be exposed.** Recommended only if an
  operator asks; the setting would sit in `limits` beside the audit
  retention days.

## Test implications (for the follow-up implementation plan)

- Unread rows survive any prune, regardless of message age.
- Read rows whose message is older than the window are deleted; read rows
  inside the window are kept.
- A message read after the window has elapsed is still pruned at the next
  pass (age keys on the message's `created_at`, not on `read_at`).
- Orphan roots are reclaimed: a recalled message with no recipient rows is
  deleted regardless of age; an aged message with no recipient rows is
  deleted; a root with any remaining recipient row is kept.
- Two consecutive runs: the second deletes 0 (idempotent).
- Restore-from-backup reintroduces pruned rows; the next maintenance run
  prunes them again (documented behavior, pinned as such).
- The maintenance log carries both counts in its existing info line.
