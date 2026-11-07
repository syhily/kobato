# ADR-0009: Realtime delivery for notifications — tuned polling, SSE deferred (spike)

- Status: proposed
- Date: 2026-11-07

## Context

The unread badge polls `notifications.unreadCount` every 60 seconds per
logged-in browser tab, plus on window focus
(`src/client/hooks/use-notifications.ts`: one shared TanStack Query
entry consumed by the sidebar nav item, the user menu, the admin footer,
and the drawer header). That is simple and robust, but a reply can sit
invisible for up to a minute, and every logged-in session costs
~1 440 requests/day even when nothing happens. The repo has no
SSE/WebSocket precedent; this spike prices the upgrade so the maintainer
can defer or schedule with data.

Facts verified against the live tree at `d557c3ae`:

- Poll cost server-side: `countUnreadNotifications` is a bare COUNT over
  `notification_recipient` covered by
  `idx_notification_recipient_user (user_id, read_at)`
  (`src/server/infra/db/schema/notification.ts`) — index-only, sub-ms.
- The process model is single-process (embedded SQLite/DuckDB, SEA
  binary); the image pool runs in worker_threads, but notifications are
  written on the main thread — an in-process `EventEmitter` fed by
  `createNotificationWithRecipients` would be a sufficient pub/sub, no
  broker.
- The 30 s global request timeout HAS an exemption mechanism:
  `requestTimeout(30_000, [{ prefix, timeoutMs }, …])` in
  `src/server/http/middleware-pipeline.ts` — an SSE endpoint would add
  one entry (or bypass by being a resource route with no timeout).
- CSRF: `csrfGuard` runs on `/rpc/*` and demands the `CSRF_HEADER` token
  (`src/server/http/middlewares/csrf.ts`). EventSource cannot set
  request headers natively — but non-JSON surfaces already live OUTSIDE
  `/rpc` as bare Hono resource routes (the analytics beacon precedent),
  where the guard does not run. An SSE stream is a non-mutating GET
  authorized by the same-origin session cookie (via
  `requestContextMiddleware`'s session), which is the correct perimeter
  for a read-only stream.
- Shutdown: `performShutdown` calls `closeHttpServer(8_000)` FIRST, then
  runs shutdown hooks (`src/server/infra/lifecycle.ts`). Node's
  `server.close()` does not end in-flight streaming responses, so SSE
  connections would stall graceful shutdown until the 8 s force-close.
  Answer: acceptable as-is (≤8 s worst case, bounded, and clients
  auto-reconnect), with the cheap refinement noted below — track open
  stream controllers in the emitter module and end them on the
  `shutting-down` phase transition, which needs no new plumbing.
- Heartbeat: the app expects to sit behind reverse proxies
  (`security.trustedProxies`); nginx's default `proxy_read_timeout` is
  60 s and Cloudflare idles out around 100 s, so a `: heartbeat` comment
  every ~25 s is required regardless of message volume.

## Options

**1. Keep polling at 60 s (baseline).** 1 440 requests/day/session;
index-covered COUNT each; up to 60 s badge latency. Zero work.

**2. Tuned polling (recommended now).** Interval 60 s → 120 s plus the
existing `refetchOnWindowFocus` and mutation-driven invalidation: halves
idle traffic to ~720 requests/day/session, keeps every code path
unchanged except one constant, and the moments a user actually cares
about (returning to the tab, opening the drawer, sending a reply)
already refetch on demand. The badge being up to two minutes stale
during idle background time has no user-visible cost at this product's
scale.

**3. SSE.** Real work items, each priced:
`GET /api/notifications/stream` as a resource route (session-cookie
auth, NO csrfGuard — documented decision above); one timeout-exemption
entry; an in-process emitter fed by the fan-out write point; per-
connection userId filtering; 25 s heartbeat; client `useEffect` opening
an EventSource (reconnect/backoff comes free) that calls
`invalidateQueries` on message; shutdown drain as analyzed above. Call
it 1–2 days including tests (heartbeat framing, auth rejection,
reconnect, multi-tab, drain). Payoff: instant badge, idle-free
connections. Cost: a second delivery mechanism to own forever, and a
long-lived connection per tab per session on a single process.

## Decision

**Adopt tuned polling (option 2) now; defer SSE.** The measured server
cost of polling is negligible (index-only COUNT), the traffic volume is
trivial for a single-tenant blog, and the only real defect — one-minute
badge latency — is halved in perception by focus-refetch and is simply
not load-bearing for an async inbox. SSE's payoff does not cover owning
a second delivery mechanism at this scale. WebSockets were not
considered: SSE is strictly sufficient for server→client badge pushes.

## Consequences

- One constant changes (`refetchInterval: 120_000`); a comment records
  the rationale and points here.
- The documented default stays "polling" until a revisit trigger fires;
  no SSE scaffolding lands in the tree.

## Revisit triggers

- Admin↔user messaging becomes a chat-like product goal (sub-minute
  delivery becomes a feature, not a nicety).
- Sustained concurrent logged-in sessions beyond ~50 (connection cost
  inverts: SSE becomes cheaper than polling).
- Mobile/PWA usage where 60–120 s background polling draws battery
  complaints.
- Any second feature needing push (live job progress, collaborative
  editing) — the connection layer is the expensive part and would then
  be shared.

## Test implications (if SSE is ever built)

- Heartbeat framing survives a proxy idle window (≥2 missed messages,
  connection alive).
- Unauthenticated / expired-session connect → 401, no stream.
- Reconnect resumes invalidation without duplicate toasts.
- Multi-tab: each tab receives its own stream; badge updates in all.
- SIGTERM drain: streams end (or are force-closed within the 8 s
  budget) and clients reconnect to the restarted server.
