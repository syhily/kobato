# ADR-0002: Process memos keep distinct single-flight semantics

- Status: accepted
- Date: 2026-07-25
- Commit: `750c5634`

## Context

The codebase grew a dozen hand-rolled process-local memoization sites.
A survey shows they cluster into a few identical shapes — plus a handful
whose similarity is only superficial:

- Two **verbatim** failure-resetting promise memos (the Shiki
  highlighter singletons in `infra/pt/prerender` and
  `domains/audit/highlight`): concurrent callers share one in-flight
  promise; a rejected bootstrap is dropped so the next call retries.
- Three **verbatim** FIFO-evict bounded maps (the `Intl.DateTimeFormat`
  cache in `shared/utils/formatter`, the branding-byte cache in
  `domains/assets/services/storage`, the image-meta cache in
  `ui/pt/blocks/BlockImage`): insert past the cap evicts the oldest key.
- Three single-flights whose **failure semantics differ and are
  load-bearing**: `infra/cache/inflight` drops the entry in `.finally`
  (failure: retry); settings hydration keeps serving the last good
  snapshot when a reload fails (failure: keep-stale — settings must stay
  available through a DB outage); canvas-font registration never
  memoizes a null result (failure: no-cache — otherwise an admin who
  configures a font after boot would need a process restart).
- One zombie: `getInstallState` was wrapped in `React.cache()` with a
  comment claiming per-render-pass dedup. Outside React Server
  Components `cache()` is a pure pass-through, so in this React Router
  SSR app the dedup never happened.

A natural follow-up to consolidating the verbatim clusters is to unify
_everything_ into one parameterized `memoize({ onFailure })` helper.

## Decision

We consolidate only the same-semantics clusters, into two primitives in
`src/shared/utils/memo.ts`:

- `createPromiseMemo(loader)` — the failure-resetting async memo
  (share-in-flight; failure: retry).
- `createBoundedMap(cap)` — the FIFO-evict bounded map.

We reject the parameterized `memoize()` unification. The failure-policy
differences are not accidental variations waiting to be normalized —
each is a deliberate contract (settings availability, font-registration
nulls). A parameter would relocate that knowledge from the call site's
comment into an option value, without eliminating it; every reader
would still have to know _why_ this site picks `keep-stale`. Three
one-line wrappers with an honest vocabulary beat one abstraction with a
knob. The surviving single-flights instead carry a one-line comment in
a shared vocabulary: share-in-flight; failure: retry / keep-stale /
no-cache.

The `React.cache()` wrapper on `getInstallState` is removed entirely —
a cheap `hasAdmin` query runs directly. An inert wrapper that documents
a guarantee it cannot provide is worse than no wrapper.

## Consequences

- One vocabulary for process memos: share-in-flight, with the failure
  policy named at each site (retry / keep-stale / no-cache). Reviewers
  can flag a new site that doesn't name its policy.
- Do NOT extend `createPromiseMemo` with failure-policy options to
  absorb the three surviving single-flights — their differences are the
  point, and this ADR is the rejection record.
- The rate-limit map (TTL + sort eviction) and the unbounded client
  memos (`use-thumbhash-bg`, `useDominantColor`) stay hand-rolled: they
  match neither cluster's semantics.
- No behavior change at any adopted site; the primitives were extracted
  verbatim from the code they replace.
