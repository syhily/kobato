# ADR-0007: Broadcast recall via soft-delete

- Status: accepted
- Date: 2026-11-07

## Context

An admin who publishes a wrong or premature announcement has no recourse
today: the notifications domain has no delete/recall operation at any
layer (schema, operations, service, controller, UI), and the audit trail
only records `notification_broadcast_created` /
`notification_direct_created`
(`src/server/http/controllers/admin/notifications.controller.ts`). Fan-out
at creation means the mistake is already in every inbox.

Facts verified against the live tree at `1b51ae2e`:

- Data model (`src/server/infra/db/schema/notification.ts`):
  `notification` (id, threadId, kind, senderId NULL=system, title, body,
  replyable, source, actionUrl, createdAt) + `notification_recipient`
  (notificationId, userId, readAt NULL=unread, createdAt;
  `uq_notification_recipient` unique pair, `idx_notification_recipient_user`
  on `(user_id, read_at)`). Recipient rows are written once at creation;
  later-registered users never see historical broadcasts.
- The broadcast author never receives their own broadcast
  (`sendBroadcast` filters `id !== senderId` in
  `src/server/domains/notifications/service.ts`), so the creator has no
  inbox row from which a recall affordance could be triggered.
- Broadcast replies fork into separate `direct` threads
  (ADR: plan 002; `replyToThread`'s broadcast branch creates a NEW thread
  carrying the root's title, with no FK back to the root).
- Thread reads and the reply gate run through `getThread` /
  `canReplyInThread`; the unread badge is `countUnreadNotifications` — a
  bare COUNT over `notification_recipient` where `read_at IS NULL`.
- Audit convention: every state-mutating admin operation records via
  `recordAuditEventFromContext`, kebab-case `<entity>_<verb>`.
- Backup/restore ships the whole content DB file, so recall state must
  be plain columns — no external side state.

## Decision

**Option A — soft-delete flag (recommended).** Add a nullable
`recalled_at` timestamp column to `notification`. Recall sets it on the
root message; every read path filters `recalled_at IS NULL`:

- `listNotificationsForUser` — recalled rows vanish from the inbox.
- `countUnreadNotifications` — recalled rows stop inflating the badge.
- `getThread` — a recalled thread answers NOT_FOUND (same shape as a
  non-participant, so existence is not leaked).
- `canReplyInThread` — a recalled replyable broadcast stops accepting
  new replies (defense in depth behind the hidden UI entry).

Rows stay in the database: the audit story survives, and recall is
reversible (an un-recall is the same UPDATE with NULL — cheap insurance
against a misclick, not a promised feature).

**Why not B (hard delete):** deleting the root + recipient rows destroys
the evidence the audit log points at (`resourceId` dangles), races with
a recipient mid-read of the thread, and makes recall irreversible. The
only thing it buys — smaller tables — is irrelevant at notification
volumes.

**Why not C (tombstone content replacement):** rewriting title/body to
「此公告已撤回」keeps the mistake visible in every inbox forever, which is
the opposite of what an admin reaching for recall wants. A tombstone
DISPLAY variant ("this announcement was recalled", shown in place of the
detail pane for users who had it open) is a compatible UI refinement on
top of A, not an alternative to it.

**Creator visibility.** Recall needs the author to see their own
broadcast. Chosen: a **creator self-row** — `sendBroadcast` inserts a
recipient row for the author pre-marked read (the same
`readRecipientIds` mechanism the reply fork already uses for the
replier's copy). This also fixes the adjacent complaint "the author
can't find what they sent anywhere", keeps the inbox the single surface,
and costs one row per broadcast. The rejected alternative — a separate
admin-only "已发送" list procedure — duplicates the inbox's query,
pagination, and item rendering for one affordance.

**Fork interaction.** Recalling the root does nothing to existing forked
reply threads: they are user↔admin conversations with independent value
(the user's feedback stays actionable), and they carry the root's title
as a plain string, so nothing dangles. The root simply stops accepting
NEW replies via the `canReplyInThread` check above.

**Unread-count SQL.** `countUnreadNotifications` becomes a join:
`COUNT(notification_recipient) INNER JOIN notification ON … WHERE
user_id = ? AND read_at IS NULL AND notification.recalled_at IS NULL`.
`idx_notification_recipient_user (user_id, read_at)` still narrows to
the user's unread rows; the join probes the message's PRIMARY KEY per
surviving row — bounded by one user's unread count, so no new index is
warranted. The inbox list query gains the same join + predicate.

**API + audit.** One admin procedure
`admin.notifications.recall({ id })` → sets `recalled_at` where NULL
(idempotent: a second call is a no-op returning the current state),
records `notification_broadcast_recalled` via
`recordAuditEventFromContext`. The same procedure also accepts
`admin`-kind system messages (e.g. a stale Zeabur-cleanup alert) for
uniformity — one gate, one audit verb shape; direct messages are NOT
recallable (private threads between people stay honest; see below).

## Consequences

- A migration adds `notification.recalled_at`; backup/restore semantics
  are automatic (a backup taken before a recall restores the message as
  visible; one taken after restores it as recalled — both coherent,
  since the state is a plain column in the shipped DB).
- A user mid-read of the thread when recall lands keeps the already-
  rendered pane until their next query invalidation; the thread endpoint
  then 404s. This is indistinguishable from any other "content changed
  under an open view" and needs no push mechanism.
- `sendBroadcast` gains the creator self-row; existing broadcasts get no
  retroactive row (their recall affordance is the audit-log-linked admin
  surface — acceptable for a v1, noted as an open question).
- The unread badge can only DECREASE on recall; no client change is
  needed beyond the existing invalidation.

## Explicitly not decided here

- UI placement of the recall affordance (row action vs detail pane vs
  audit-log link).
- Batch recall, scheduled recall, or recall of direct messages
  (recommended against for v1: private threads between people are not
  recallable in any mainstream product without a time window, and the
  misuse surface — silent history rewriting — is worse than the
  problem).
- Retroactive creator rows for pre-feature broadcasts.

## Test implications (for the follow-up implementation plan)

- Recall hides the message from `listInbox` (all tabs) and drops
  `unreadCount` for every recipient.
- `getThread` on a recalled thread → NOT_FOUND for recipients AND admins.
- `replyToThread` on a recalled replyable broadcast → BAD_REQUEST.
- Existing forked threads stay readable and replyable after the root is
  recalled.
- The creator self-row: author sees their broadcast pre-read; unread
  count unaffected; recall from that row works.
- Second recall call → idempotent success, exactly one additional audit
  row policy decided (recommended: no new audit row on no-op).
- Restore of a pre-recall backup shows the message again (documented,
  not fixed).

## Open questions

- Should un-recall be exposed in the UI, or stay a database-level
  escape hatch? (Leaning: escape hatch; the audit log records only
  recall.)
- Do `admin`-kind system alerts age out on their own (read + time), or
  is recall their only cleanup? A retention sweep may be the better
  answer for those.
