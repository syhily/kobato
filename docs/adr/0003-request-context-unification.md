# ADR-0003: One request context, three projections

- Status: accepted
- Date: 2026-07-26

## Context

A single HTTP request used to be decoded three times, once per framework
surface:

- **Hono** middleware #1 injected flat vars (`db`, `pool`, `cspNonce`),
  a session middleware resolved the session and injected more
  (`session`, `viewer`, `clientAddress`), and downstream middlewares
  (CSRF, rate-limit, RBAC, install-gate) re-read and re-derived from
  those — the install-gate even re-parsed the URL to strip `.data`.
- The **oRPC bridge** re-extracted request facts and hand-assembled a
  `HandlerContext` whose `viewer` was a _different type_
  (`ViewerContext { userId, role }`) than the session's own user
  (`SessionUser { id, … }`), forcing every controller to translate.
- The **React Router bridge** (`buildLoadContext`) re-projected the
  Hono vars into five separate `RouterContextProvider` keys, and
  loaders that couldn't trust the keys carried fallbacks
  (`tryGetSessionContext(...) ?? resolveSessionContext(...)`) that
  re-resolved the session a second time per request. `entry.server.tsx`
  generated a fallback CSP nonce when the key was missing, so a request
  could carry two different nonces.

The viewer-type schism (`userId` vs `id` for the same identity) was the
sharpest symptom: ~40 call sites converted between the two dialects,
and every audit literal re-built the actor triple by hand.

## Decision

**One derivation, three projections.** `requestContextMiddleware`
(`src/server/http/middlewares/request-context.ts`) runs first in the
Hono pipeline and derives the canonical `RequestContext`
(`src/server/http/request-context.ts`) exactly once: session, viewer,
proxy-aware client address, normalized document URL (`.data` /
`_routes` / `index` stripped by `normalizeDocumentUrl`), request facts,
db/pool handles, CSP nonce. It is stored as the _only_ Hono var besides
`requestId`, and every surface projects from it:

- Hono handlers/middlewares read `c.var.requestContext.*`.
- The oRPC bridge copies explicit fields into `HandlerContext`
  (deliberately without `markSessionDirty` — procedures get a read-only
  session).
- `buildLoadContext` sets the canonical RR context key
  (`getRequestContext(args)` for loaders) as the single value on the
  `RouterContextProvider`. (During the migration it also set the legacy
  five keys via `projectLegacyRouteContexts`; both were deleted when
  the route-side migration landed.)

**Viewer IS the SessionUser.** `ViewerContext` is deleted. `rbac.ts`
predicates take the structural minimum `ViewerIdentity { id, role }`,
which a `SessionUser` satisfies; the audit context reads the same
shape, so `recordAuditEventFromContext(context, …)` works unchanged on
every surface.

**Two-channel session contract.** Same-session mutations (CSRF token
minting, cart-like flags) call `markSessionDirty()` and the middleware
writes the `Set-Cookie` after `next()` — the single commit point.
Sid-changing flows (login rotation, logout) keep their explicit
`Set-Cookie` channel via `establishLoginSession` / `destroySession`.
The two channels never mix: a handler that rotates the sid does not
also rely on the dirty-commit. The seam is enforced in the middleware:
when the response already carries a `__session` `Set-Cookie`, the
dirty-commit is skipped — browsers apply same-name cookies in order
and the middleware's header would land last, overriding the route's
rotation/destroy and resurrecting the deleted session row. (The
signin-flow's OTP-pending commits still use the explicit channel for
same-session mutations; converging them onto `markSessionDirty` is
deliberately left as follow-up — the skip rule makes the mix safe
meanwhile.)

**No fallbacks.** The dual-source nonce, the
`tryGetSessionContext(...) ?? resolveSessionContext(...)` loader
fallbacks, and the per-consumer `.data` strips are deleted. A missing
context is a programming error and throws (React Router's
`context.get` already throws on a missing key).

## Rejected alternatives

- **React Router middleware as the context owner.** RR8 stabilised
  middleware, but the Hono perimeter owns concerns RR never sees
  (oRPC bridge, resource routers, install-gate redirect, rate limits).
  Owning the context in RR middleware would split the perimeter in two
  and re-introduce a second derivation point for non-RR requests. RR
  middleware may still enforce route-local policy later, but the fact
  base stays Hono-owned.
- **Unifying on `ViewerContext { userId }`** (keeping the old dialect
  and mapping SessionUser into it) — preserves a translation that
  exists only for historical reasons; the session user is the identity.
- **Adopting RR8 RSC / server components now** — RSC support in React
  Router is still moving; we revisit once it stabilises. ("等稳定再评估"。)

## Consequences

- New per-request facts get one home: add a field to `RequestContext`
  and derive it in the middleware; every surface sees it without
  plumbing.
- Controllers lost the `userId`/`id` dialect; domain services
  (`session-guard`, taxonomy/music/post ownership checks) speak
  `ViewerIdentity`.
- The legacy RR keys and `getRouteRequestContext` /
  `getDbFromContext` were deleted once the route-side migration
  completed (same release); every loader/action reads the single
  canonical key via `getRequestContext(args)`.
- Analytics treats normalized data requests as first-class
  (`RequestFacts.isDataRequest`) instead of each consumer re-detecting
  them.
