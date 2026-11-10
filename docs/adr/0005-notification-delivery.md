# ADR-0005: Notification delivery, recall, and retention

- Status: accepted
- Date: 2026-11-07
- Supersedes: the former separate notification email, realtime-delivery, and retention ADRs

## Context

The notification center is the product's memory: `notification` holds one row
per message (`kind` = `direct` | `admin` | `broadcast`, `senderId` NULL =
system, roots carry `threadId = id`), fanned out at creation into
`notification_recipient` (unique `(notification_id, user_id)`, `read_at` NULL =
unread). Fan-out is write-once: later-registered users never see historical
broadcasts, and the author never received their own broadcast.

Three gaps followed from that shape. An admin who published a wrong or
premature announcement had no recall path at any layer, and fan-out meant the
mistake already sat in every inbox. In-app delivery was the only delivery, so a
direct message could sit unread for days on a single-admin blog. And nothing in
`src/` deleted from either table, so the content DB and every backup archive
grew without bound while the unread badge's only freshness mechanism was a
client poll.

## Decision

### Recall — soft delete only

`recallNotification` stamps a nullable `notification.recalled_at`
(`src/server/infra/db/schema/notification.ts`); the message and its recipient
rows stay. Every read path filters `recalled_at IS NULL`:

- `listNotificationsForUser` — recalled rows vanish from the inbox.
- `countUnreadNotifications` — recalled rows stop inflating the badge; the
  count becomes a `notification_recipient INNER JOIN notification`.
  `idx_notification_recipient_user (user_id, read_at)` still narrows to the
  user's unread rows and each survivor probes the message PRIMARY KEY, bounded
  by one user's unread count — no new index.
- `getThread` — NOT_FOUND in the same shape as a non-participant, so existence
  is not leaked.
- `canReplyInThread` — a recalled replyable broadcast accepts no new replies
  (defense in depth behind the hidden UI entry).

Reversal is the same UPDATE with NULL: a database-level escape hatch, not a UI
feature, and the audit log records only recall.

`recallMessage` (`src/server/domains/notifications/service.ts`) refuses `direct`
messages so private threads between people stay honest. `admin`-kind system
alerts (e.g. a stale Zeabur-cleanup alert) are recallable through the same gate
as broadcasts. One admin procedure `admin.notifications.recall({ id })` covers
both and is idempotent: a second call is a no-op returning the current state and
writes no second audit row. The audit verb splits by the recalled row's kind —
`notification_broadcast_recalled` (operator withdrawing an announcement) vs
`notification_admin_recalled` (housekeeping on a system alert) — recorded via
`recordAuditEventFromContext` only when the row was newly recalled.

**Creator self-row.** `sendBroadcast` inserts the author's own recipient row
pre-marked read through the existing `readRecipientIds` mechanism, so the author
can find and recall what they sent and the inbox stays the single surface. A
separate admin-only "sent" list was rejected: it duplicates the inbox's query,
pagination and item rendering for one affordance. Broadcasts created before
this decision get no retroactive row.

**Forks are untouched.** Recalling a root does nothing to already forked reply
threads: they are user↔admin conversations with independent value, carry the
root's title as a plain string, and simply stop accepting new replies through
`canReplyInThread`.

Rejected: hard delete (destroys the evidence `resourceId` points at, races a
recipient mid-read, irreversible); tombstone content replacement (rewriting
title/body keeps the mistake visible in every inbox forever — the opposite of
what an admin reaching for recall wants). A tombstone _display_ variant ("this
announcement was recalled"), shown in place of the detail pane, remains a
compatible UI refinement on top of the soft delete.

### Email — `direct` and `admin` only, immediate, fire-and-forget

**Trigger set.** Broadcasts never email. Fan-out is one transport call per
recipient and the sender has no batching, queue or rate limiting, so a 500-user
announcement would open 500 SMTP conversations for a message class that is
explicitly "see it when you visit". `direct` messages and system→admin alerts
are the low-volume, high-urgency classes email is for.

**Timing.** Immediate, no digest. A digest adds up to 24 h of delay to the exact
scenario that motivates the feature ("the admin has not logged in for days"),
and comments already send immediately. If a chatty thread appears, the lever is
the per-key dedupe window the job-failure notifier uses, not a digest.
`job-registry` could schedule one later; no consumer until a revisit trigger
fires.

**Gate.** `mail.enabled === true` AND `mail.notificationEmails !== false`, read
from the settings snapshot (`notificationEmails` defaults ON in
`src/server/domains/settings/sections/mail.ts`). A missing snapshot or section
reads as OFF, because boot-time producers can run before settings hydration.
There is no per-user preference: that needs a `user` column or a `user_setting`
table with no precedent in the repo, plus UI, for an audience of one admin and
a handful of authors.

**Wiring.** After `createAndFanOut` returns inside the notifications domain
producers (`notifyAdmins`, `sendDirectMessage`, both `replyToThread` direct
branches), `queueNotificationEmail`
(`src/server/domains/notifications/email.ts`) resolves recipient emails with
`findUserEmailsByIds`
(`src/server/infra/db/operations/notification.ts`) and sends one message per
recipient, sequentially. `fireAndForgetNotify` keeps the send off the
transaction: an SMTP outage never delays, errors or rolls back the committed
in-app fan-out, and the failure reaches the server log only. Producers keep
their synchronous signatures, and Platform domains still receive `notifyAdmins`
injected — the email side effect lives inside the notifications domain, never
at the call site.

**Content.** The shared `AdminNotificationEmail` family, not a parallel
template. Subject from `email.notification.directSubject` /
`email.notification.adminSubject`, heading from `directTitle` / `adminTitle`,
body rows from the resolved title and body (plain text, escaped by React — no
sanitizer needed, unlike comment HTML), CTA to `${siteIdentity.website}/admin`
for admin alerts and the site root for DMs, and footer note
`email.notification.footerNote` telling the recipient the mail is
notification-triggered and can be switched off in the mail settings. HTML only,
matching every existing template.

**No loops by construction.** Email is outbound-only with a link; reply-by-email
does not exist. A reply creates at most one notification, which fires at most
one email.

### Realtime — tuned polling; SSE deferred

The unread badge uses one shared TanStack Query entry
(`src/client/hooks/use-notifications.ts`) with `refetchInterval: 120_000`,
`refetchOnWindowFocus: true`, mutation-driven invalidation, and read-state
patching from the mutation response. The polled count is a join over an
index-narrowed set, and an async inbox tolerates a stale badge while the tab
sits in the background; 120 s halves idle traffic to roughly 720 requests per
day per session while the moments users care about (returning to the tab,
opening the drawer, sending a reply) refetch on demand.

**Exactly one observer per shell.** `AppSidebar` on admin, `BaseLayout` on
public; the count is passed DOWN as a prop to `NotificationsDrawer`, nav items
and user menus. `refetchInterval` runs one timer per observer with no freshness
check, so an extra `useUnreadNotificationCount` call site silently multiplies
the fetch cadence. The hook is tri-state on purpose: `null` means unknown (not
loaded yet, or the query failed) — never fold it into `0`, which is a confirmed
"nothing unread".

**SSE is deferred, not scaffolded.** No stream endpoint, emitter or client
`EventSource` lands until a revisit trigger fires: admin↔user messaging becomes
a chat-like goal (sub-minute delivery is a feature), sustained concurrent
logged-in sessions beyond ~50 (connection cost inverts), mobile/PWA battery
complaints about background polling, or any second feature needing push (live
job progress, collaborative editing) — the connection layer is the expensive
part and would then be shared. WebSockets were not considered; SSE is strictly
sufficient for server→client pushes. When built, the known constraints are:
`GET /api/notifications/stream` as a bare Hono resource route outside `/rpc`
(same-origin session cookie; `csrfGuard` only runs on `/rpc/*`), a
`requestTimeout(30_000, …)` exemption entry in
`src/server/http/middleware-pipeline.ts`, an in-process emitter fed by
`createNotificationWithRecipients` (single process, embedded SQLite — no
broker), per-connection userId filtering, a `: heartbeat` comment every ~25 s
(nginx default `proxy_read_timeout` 60 s, Cloudflare idles out ~100 s), and
shutdown drain: `performShutdown` closes the HTTP server with an 8 s budget
first and `server.close()` does not end streaming responses, so stream
controllers must be tracked and ended on the `shutting-down` phase transition.

### Retention — prune read rows after 180 days

`pruneNotifications(db, now)` in
`src/server/infra/db/operations/notification.ts`, with hardcoded
`NOTIFICATION_RETENTION_DAYS = 180` (matching the analytics
`ACCESS_EVENTS_RETENTION_DAYS` — the number this repo already treats as "how
long user data lives"). Called from `runDbMaintenance` after `pruneJobRuns`,
same shape (one sync transaction returning counts), counts
`notificationRecipientsPruned` and `notificationsPruned` in the existing
maintenance info log line. Daily at 04:30 site time.

1. Read recipient rows past the window: `read_at IS NOT NULL` and the joined
   `notification.created_at` older than `now - 180 days`.
2. Orphan roots: `notification` rows with no remaining recipient row AND
   (`recalled_at IS NOT NULL` OR `created_at` older than the cutoff). Runs after
   step 1 in the same transaction, so roots whose last recipient rows were just
   deleted are reclaimed in the same pass.

Age is ALWAYS the message's `created_at` through the join, never a
recipient-side timestamp (`notification_recipient` carries none, and a message
read late is still an old message). This is a message-age window, not a dwell
window: a row read on day 179 is pruned on day 181. **Unread rows are never
pruned** — deleting one silently destroys user state: the badge shrinks, the
drawer never showed it, and the user cannot learn what was missed.

No setting, UI, admin procedure or audit event: this is maintenance, not an
operator action. A `limits.notificationRetentionDays` setting was rejected to
keep the settings surface small, so an operator who never opens the settings
page still gets a bounded database; adding it later is one constant away from a
config read and does not change the predicate.

## Consequences

- Recall, the unread count and retention all key off plain columns inside the
  shipped DB file. A backup taken before a recall restores the message visible,
  one taken after restores it recalled; restoring a pre-prune backup revives
  pruned rows until the next maintenance pass prunes them again. Both coherent
  and accepted — suppressing the latter would mean keeping exactly the rows the
  prune exists to remove.
- The badge can only DECREASE on recall, so the existing invalidation suffices.
  A user mid-read when recall lands keeps the rendered pane until the next
  query invalidation, then gets NOT_FOUND — indistinguishable from any other
  "content changed under an open view", so no push mechanism is needed.
- Mail-enabled installs start sending per-message email on upgrade; the toggle
  defaults ON (the feature is the point) and the settings card copy must say
  so. Mail-disabled installs short-circuit before any transport work.
- Self-hosted SMTP on small VPS providers throttles bursts; the accepted risk is
  bounded by `direct`/`admin` volumes. Recipient-email resolution adds one
  indexed SELECT per fan-out.
- Audit `resourceId` dangles for pruned rows. The audit row records who did what
  and when; the target's existence was never the evidence, and most references
  are already gone because audit DB retention defaults to 30 days versus 180
  here.
- The retention sweep is one full pass per day. Both recipient indexes are
  user-scoped, so neither serves a global "old read rows" scan: the first pass
  is a scan + join, milliseconds at realistic volumes inside a job that already
  runs `incremental_vacuum`. If an install outgrows it, add an index on
  `notification(created_at)` — do not batch in application code.
- Read-path cost does not move: unread rows are never deleted, and removing read
  rows only shrinks `idx_notification_recipient_user`.

**Do not reintroduce:** hard-deleting recalled messages or rewriting their
content; recalling `direct` messages; a separate admin "sent" list; email for
broadcasts, per-user email preferences, digests, reply-by-email or push
notifications; a second unread-count observer per shell; SSE scaffolding before
a revisit trigger; pruning unread recipient rows or keying retention age on a
recipient column; an application-level batched prune loop.

**Open, deliberately not decided:** un-recall exposed in the UI (leaning: keep
it a database escape hatch); exempting recalled messages from the
never-prune-unread rule (the guarantee protects nothing there and instead
immortalizes the rows — a policy change needing maintainer sign-off);
soft-deleted users' immortal unread rows; batch or scheduled recall; retroactive
creator rows for pre-feature broadcasts; exposing the retention window under
`limits` beside the audit-retention days.
