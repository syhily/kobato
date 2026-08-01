# ADR-0005: Framework revisit triggers and the unhandledRejection prerequisite

- Status: accepted
- Date: 2026-08-01

## Context

The 2026-08-01 architecture evaluation
(`docs/plans/2026-08-01-architecture-evaluation.md`, revised) audited the
Hono + oRPC + React Router 8 stack against the framework's official
capabilities and reached stable conclusions on every "should we replace a
layer" question. Without a recorded decision, those questions resurface
every few months and cost the same evaluation effort each time.

Two load-bearing facts shaped the second half of this decision:

1. The detail page (the blog's core page) streams its comments through an
   un-awaited loader promise (`src/server/http/loaders/comments.ts` →
   `<Await>` in `DetailBodyChrome.tsx`). React Router only subscribes to a
   streamed promise when turbo-stream serializes it; a rejection before
   that point has no listener, and Node's default `unhandledRejection`
   mode (`throw`) crashes the process. This was a live crash window until
   the handler below landed.
2. Two wiring checks the evaluation flagged as "to verify" were verified
   clean and are recorded here so they are never re-opened:
   - `react-router typegen` runs before `tsc` (the `type` script is
     `react-router typegen && tsc`; CI calls `pnpm run type`);
   - `/__manifest` (Lazy Route Discovery) requests do not pollute page-view
     analytics: `isDataRequestUrl` matches only the `.data` suffix, the
     manifest endpoint is answered by the RR runtime before any document
     loader runs, and the path is already exempted in the visitor-cookie
     and install-gate middlewares.

## Decision

1. **Framework-replacement proposals are rejected by default.** Next.js,
   TanStack Start, and Express-in-place-of-Hono are settled per the
   evaluation report §5 and must not be re-evaluated until one of these
   triggers fires:
   - React Router's RSC / server functions ship as a **stable** API
     (carries forward the revisit point recorded in ADR-0003). Even then,
     `'use server'` lacks procedure-level guards, shared contracts, and
     typed error envelopes, so oRPC most likely stays — the trigger opens
     an evaluation, not a migration.
   - Hono is abandoned or develops an unworkable security issue.
   - The SEA self-hosted single-binary deployment model is abandoned
     (this invalidates the primary Next.js objection).
2. **The process-level `unhandledRejection` handler is prerequisite
   infrastructure for streamed promises and must not be removed** while
   any loader returns an un-awaited promise. It lives in
   `src/server/infra/lifecycle.ts` (`handleUnhandledRejection`) and
   deliberately logs-and-continues: a streamed query failure is a
   per-request, recoverable fault and must not kill every in-flight
   request. The accepted cost is that genuine bugs elsewhere can be
   masked; the hedge is a loud, structured error log. Any change to
   streaming usage re-examines this trade-off.

## Consequences

- Architecture discussions of the "replace framework X" kind are closed
  until a trigger fires; the evaluation report is the reference document.
- `tests/unit/server/http/glue-contract.test.ts` pins the integration
  glue (middleware order, oRPC bridge projection, request-context
  projections, entry.server export surface) so a change to any seam fails
  loudly in CI.
- New streamed-promise usages are allowed without further process-level
  work, provided the handler remains registered.
