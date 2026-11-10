# ADR-0001: Request and process state

- Status: accepted
- Date: 2026-11-10
- Supersedes: the former separate process-memo and request-context ADRs

## Context

Kobato ships as one Docker container or one SEA binary, so blog settings, process memos, and
per-request facts are all process-scoped. Three decisions grew in that shape: a Redis-shared
settings version counter that could never invalidate anything, a dozen hand-rolled memo sites
with three different failure policies, and a request decoded three times (Hono middleware, oRPC
bridge, React Router bridge) with two viewer dialects (`userId` vs `id`) and ~40 translation
call sites.

Multi-replica deployments are not a design target. This ADR records the rules for state that
lives in the process or in one request.

## Decision

### Single process, one settings snapshot

The blog settings cache is `BLOG_SETTINGS_SNAPSHOT_SLOT`, an in-process snapshot that is
authoritative once loaded; `refreshBlogSettings` (called on the write path) is its only
invalidation channel. The Redis version counter (`settings:snapshot:version`,
`services/version.ts`, hydration reconciliation) is deleted rather than repaired.

### Process memos: two primitives, three named failure policies

`src/shared/utils/memo.ts` holds the two consolidated shapes:

- `createPromiseMemo(loader)` — share-in-flight async memo; a rejected bootstrap is dropped so
  the next call retries. Used by the Shiki highlighter singletons (`infra/pt/prerender`,
  `domains/audit/highlight`).
- `createBoundedMap(cap)` — FIFO-evict map: an insert past the cap evicts the oldest key. Used by
  the `Intl.DateTimeFormat` cache (`shared/utils/formatter`), the branding-byte cache
  (`domains/assets/services/storage`), and the image-meta cache (`ui/pt/blocks/BlockImage`).

Three single-flights keep distinct, load-bearing failure semantics, each with a one-line comment
in the shared vocabulary (share-in-flight; failure: retry / keep-stale / no-cache):

- `infra/cache/inflight` — drops the entry in `.finally` (failure: retry).
- Settings hydration — keeps serving the last good snapshot when a reload fails (failure:
  keep-stale; settings must stay available through a DB outage).
- Canvas-font registration — never memoizes a null result (failure: no-cache; otherwise an admin
  who configures a font after boot needs a process restart).

A parameterized `memoize({ onFailure })` absorbing all of them is rejected: the policy
differences are deliberate contracts, and an option value would relocate each site's rationale
from its comment into a knob without eliminating it.

### One request context, three projections

`requestContextMiddleware` (`src/server/http/middlewares/request-context.ts`) runs first in the
Hono pipeline and derives the canonical `RequestContext` (`src/server/http/request-context.ts`)
exactly once: session, viewer, proxy-aware client address, normalized document URL (`.data` /
`_routes` / `index` stripped by `normalizeDocumentUrl`), request facts, db/pool handles, CSP
nonce. It is the only Hono var besides `requestId`, and every surface projects from it:

- Hono handlers and middlewares read `c.var.requestContext.*`.
- The oRPC bridge copies explicit fields into `HandlerContext`, deliberately without
  `markSessionDirty` — procedures get a read-only session.
- `buildLoadContext` sets the canonical key (`getRequestContext(args)`) as the single value on
  the `RouterContextProvider`. The legacy five RR keys (`projectLegacyRouteContexts`),
  `getRouteRequestContext`, and `getDbFromContext` are deleted.

Viewer **is** the `SessionUser`: `ViewerContext` is deleted, `rbac.ts` predicates take the
structural minimum `ViewerIdentity { id, role }` that a `SessionUser` satisfies, and the audit
context reads the same shape, so `recordAuditEventFromContext(context, …)` works unchanged on
every surface.

### Two-channel session contract

- Same-session mutations (CSRF token minting, cart-like flags, signin OTP staging and fail
  counters) call `markSessionDirty()`; the middleware writes `Set-Cookie` after `next()` — the
  single commit point. Signin flows take a `SigninFlowContext` and never commit explicitly.
- Sid-changing flows (login rotation via `establishLoginSession`, logout via `destroySession`)
  keep their explicit `Set-Cookie` channel.
- The channels never mix. When the response already carries a `__session` `Set-Cookie`, the
  dirty-commit is skipped: browsers apply same-name cookies in order, so the middleware header
  would land last and override the rotation/destroy, resurrecting the deleted session row.

### No fallbacks

A missing context is a programming error and throws (`context.get` already throws on a missing
key). Deleted and not to be reintroduced: the fallback CSP nonce in `entry.server.tsx`, the
`tryGetSessionContext(...) ?? resolveSessionContext(...)` loader fallbacks, per-consumer `.data`
strips, and the install-gate's URL re-parse.

## Rejected alternatives

- **React Router middleware as context owner.** The Hono perimeter owns concerns RR never sees
  (oRPC bridge, resource routers, install-gate redirect, rate limits); owning the context in RR
  middleware would split the perimeter and add a second derivation point for non-RR requests. RR
  middleware may still enforce route-local policy; the fact base stays Hono-owned.
- **Unifying on `ViewerContext { userId }`.** Keeps a translation that exists only for
  historical reasons; the session user is the identity.
- **Adopting RR8 RSC / server components now.** RR's RSC support is still moving; revisit once
  it stabilises.

## Consequences

- New per-request facts have one home: add a field to `RequestContext`, derive it in the
  middleware, and every surface sees it without plumbing.
- A new process-memo site must name its failure policy (share-in-flight; failure: retry /
  keep-stale / no-cache) in a comment; an unnamed policy is a review flag.
- Do NOT extend `createPromiseMemo` with failure-policy options to absorb the three surviving
  single-flights — their differences are the point.
- Do NOT wrap `getInstallState` (or anything else) in `React.cache()` again. Outside RSC it is a
  pass-through, so the dedup never happens; a cheap `hasAdmin` query runs directly. An inert
  wrapper that documents a guarantee it cannot provide is worse than no wrapper.
- Do NOT reintroduce a cross-process settings version counter without revisiting this ADR. If
  multi-instance support becomes real, consult the shared version **before** the local
  short-circuit and prove it with a two-process test.
- The rate-limit map (TTL + sort eviction) and the unbounded client memos (`use-thumbhash-bg`,
  `useDominantColor`) stay hand-rolled; they match neither cluster's semantics.
- Controllers carry no `userId`/`id` dialect; domain services (`session-guard`,
  taxonomy/music/post ownership checks) speak `ViewerIdentity`.
- Analytics treats normalized data requests as first-class (`RequestFacts.isDataRequest`)
  instead of each consumer re-detecting them.
