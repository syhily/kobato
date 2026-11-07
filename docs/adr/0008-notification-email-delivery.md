# ADR-0008: Email delivery for notifications (spike)

- Status: proposed
- Date: 2026-11-07

## Context

Direct messages and admin-directed system alerts (the Zeabur mail
cleanup, job-failure notices from the `job-run` producer) are visible
only inside the app, gated on the user opening the drawer or the
60-second badge poll (`src/client/hooks/use-notifications.ts`). For a
single-admin blog the admin may not log in for days — a private message
sits unread precisely when it matters most.

The repo already owns the entire outbound mail pipeline, so this spike
priced the wiring instead of the plumbing. Evidence (verified at
`d557c3ae`):

- `src/server/infra/email/sender.ts` — two transports (SMTP, Mailgun)
  behind a settings snapshot (`requireBlogSettingsSection('mail')`), a
  fingerprint-cached transport, and a plain `sendEmail(to, subject,
  html)` returning `SendResult`. There is NO batching, queue, or rate
  limiting — every send is one transport call.
- `src/server/domains/comments/services/email.ts` — the proven
  notification-email shape: per-event, immediate, HTML rendered from a
  ReactElement template, called fire-and-forget from the comment flow
  (`mutate.ts` uses `fireAndForgetNotify`; `moderate.ts` uses
  `void …catch`), because "a mail hiccup must never fail the triggering
  action" (`src/server/infra/email/admin-notification.ts`).
- `AdminNotificationEmail` — an existing generic template taking
  `preview` / `title` / `contextLine` / `rows` / `cta`; the comment
  new-message email is a thin configuration of it.
- Layering: `notifications` is a Feature domain; `infra/email` sits
  below it, and `comments` (same stratum) already imports
  `infra/email/*` directly — the precedent is exact.
  `requireBlogSettingsSection` reads the in-memory settings snapshot
  from `shared/`, so no settings-domain import is needed either.
- `user.email` exists for every account; there is NO per-user
  preference storage anywhere in the repo (settings are blog-scoped).
- `src/server/infra/job-registry.ts` — a registered-job mechanism with
  rescheduling exists, so a digest job is buildable if ever wanted.

## Decision (the six spike questions)

1. **Trigger granularity — `direct` and `admin` kinds only; broadcasts
   stay in-app.** A broadcast fans out to every user; the sender has no
   batching (one transport call per recipient, sequentially), so a
   500-user site would fire 500 SMTP conversations per announcement —
   cost and spam-score risk for a message class that is explicitly
   "see it when you visit". Direct messages (admin↔user) and
   system→admins alerts (Zeabur cleanup, job failures) are exactly the
   low-volume, high-urgency classes email is for.
2. **Timing — immediate, fire-and-forget, matching the comment
   pipeline.** A digest (hourly/daily via `job-registry`) was rejected
   for v1: the driving scenario is "admin has not logged in for days",
   where a daily digest adds up to 24 h of delay on top, and immediate
   sending is what the existing product already does for comments —
   consistency wins. The dedupe lever for chatty threads is the same
   one the job-failure notifier uses (per-key window), not a digest.
3. **Opt-out — blog-level toggle in the `mail` settings section; no
   per-user preference in v1.** A per-user model needs either a `user`
   column or a new `user_setting` table with zero precedent in the
   repo, plus UI, for a feature whose realistic audience is one admin
   and a handful of authors. The toggle rides the existing section
   (`mail.notificationEmails: boolean`, default ON when mail is
   enabled); the global `mail.enabled = false` case already degrades
   every send to a logged skip via `checkMailReady`, so mail-disabled
   installs need no extra branch. Footer copy sketch (zh-CN):
   「此邮件由系统通知触发，可在「系统设置 → 邮件」中关闭通知邮件。」
4. **Content — reuse the `AdminNotificationEmail` template family, not
   a parallel one.** Subject pattern follows the comment mail:
   `您在【{site}】收到一条新私信` / `【{site}】系统提醒：{title}`. Body:
   the notification's title + body as escaped/plain rows (notification
   bodies are plain text — no sanitize strategy needed, unlike comment
   HTML), CTA linking to `${siteIdentity.website}/admin` (admin
   alerts) or the site root (user DMs). HTML only — `sendEmail` sends
   HTML today and every existing template is HTML.
5. **Failure isolation — fire-and-forget, identical to comments.** The
   in-app fan-out is a sync transaction in
   `createNotificationWithRecipients`; the email side-effect attaches
   AFTER it returns, through `fireAndForgetNotify`, so an SMTP outage
   can never roll back, delay, or error the triggering action — the
   failure lands in the server log only.
6. **Loops — impossible by construction.** Emails are outbound-only
   notifications with a link; there is no reply-by-email. A reply
   creates at most one new notification row, which fires at most one
   email; no email-triggered action creates another email.

**Wiring point.** Inside the notifications domain's producers
(`sendDirectMessage`, `notifyAdmins`, `replyToThread`'s direct
branches): after `createAndFanOut` returns, resolve recipient emails
(a new `findUserEmailsByIds` beside `findUserNamesByIds` in
`infra/db/operations/notification.ts`) and fire-and-forget one send per
recipient. This keeps the Platform-domain injection boundary intact:
Platform callers keep receiving `notifyAdmins` injected — the email
side effect lives inside the notifications domain, not at the call
site.

## Consequences

- A mail-enabled install starts sending per-message email immediately
  on upgrade; the toggle defaults ON (the feature is the point), and
  the settings card copy must say so.
- Mail-disabled installs (the default) are untouched: `checkMailReady`
  short-circuits before any transport work.
- Self-hosted SMTP on small VPS providers throttles bursts; the
  accepted risk is bounded by `direct`/`admin` volumes, and a per-key
  dedupe window (the `job-run` notifier pattern) is the documented
  lever if a chatty thread appears.
- Recipient email resolution adds one indexed SELECT per fan-out —
  negligible at these volumes.

## Out of scope (explicitly rejected for v1)

- Reply-by-email, broadcast emails, per-user preferences, digests,
  push notifications.
- Digest scheduling infrastructure (mechanism exists in
  `job-registry`; no consumer until a revisit trigger fires).

## Test implications (for the follow-up build plan)

- Mail disabled → producers behave exactly as today (no send attempted,
  no error).
- Toggle off → in-app delivery only.
- Transport failure → producer resolves normally; error only in logs
  (fire-and-forget), covered with the existing email test doubles.
- `direct` reply → exactly one email per recipient; `broadcast` → zero.
- Opt-out footer copy renders; subject matches the comment-mail pattern.
- Rapid DM thread → dedupe window (if adopted) caps sends per thread.

## Appendix: spike notes

No throwaway prototype was built — the comments pipeline
(`services/email.ts` + `fireAndForgetNotify`) IS the working prototype
of every mechanism this design needs (template render, settings gate,
fire-and-forget isolation), and the only genuinely new piece is the
recipient-email lookup, a five-line mirror of `findUserNamesByIds`.
