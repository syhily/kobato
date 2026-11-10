# ADR-0003: Framework revisit triggers and the unhandledRejection prerequisite

- Status: accepted
- Date: 2026-08-01

## Context

The Hono + oRPC + React Router 8 stack was audited against the framework's
official capabilities; every "should we replace a layer" question was settled.
Recording the answer stops that evaluation cost recurring. Two facts are
load-bearing for the second half of this decision:

- The detail page (the blog's core page) streams comments through an un-awaited
  loader promise (`src/server/http/loaders/comments.ts` → `<Await>` in
  `DetailBodyChrome.tsx`). React Router subscribes to a streamed promise only
  once turbo-stream serializes it; a rejection before that point has no
  listener, and Node's default `unhandledRejection` mode (`throw`) crashes the
  process.
- Two wiring checks are verified clean and are never re-opened. Typegen runs
  before `tsc` (`type` is `react-router typegen && tsc`; CI calls
  `pnpm run type`), and `/__manifest` (Lazy Route Discovery) does not pollute
  page-view analytics — `isDataRequestUrl` matches only the `.data` suffix, the
  RR runtime answers the manifest endpoint before any document loader runs, and
  the path is exempted in the visitor-cookie and install-gate middlewares.

## Decision

1. **Framework-replacement proposals are rejected by default.** Next.js, TanStack
   Start, and Express-in-place-of-Hono are settled and must not be re-evaluated
   until one of these triggers fires:
   - React Router's RSC / server functions ship as a **stable** API. Even then,
     `'use server'` lacks procedure-level guards, shared contracts, and typed
     error envelopes, so oRPC most likely stays — the trigger opens an
     evaluation, not a migration.
   - Hono is abandoned or develops an unworkable security issue.
   - The SEA self-hosted single-binary deployment model is abandoned (this
     invalidates the primary Next.js objection).
2. **The process-level `unhandledRejection` handler is prerequisite
   infrastructure for streamed promises and must not be removed** while any
   loader returns an un-awaited promise. `handleUnhandledRejection`
   (`src/server/infra/lifecycle.ts`) deliberately logs-and-continues: a streamed
   query failure is a per-request recoverable fault, not a reason to kill every
   in-flight request. The accepted cost is masked bugs elsewhere, hedged by a
   loud, structured error log; any streaming change re-examines this trade-off.

## Consequences

- "Replace framework X" discussions are closed until a trigger fires.
- `tests/unit/server/http/glue-contract.test.ts` pins the integration glue
  (middleware order, oRPC bridge projection, request-context projections,
  `entry.server` export surface), so a change to any seam fails in CI.
- New streamed-promise usages need no further process-level work, provided the
  handler remains registered.
