# ADR-0001: Settings snapshot is single-process; the Redis version machinery is deleted

- Status: accepted
- Date: 2026-07-21
- Commit: `cc7ca9b7`

## Context

The blog settings are cached in an in-process snapshot
(`BLOG_SETTINGS_SNAPSHOT_SLOT`) so requests do not hit the database for
every read. A Redis-shared version counter (`settings:snapshot:version`)
existed to invalidate that snapshot across processes: a save bumped the
shared counter, and hydration compared the local counter against it,
reloading from the database when the shared value was newer. Its only
purpose was multi-instance deployments (rolling restarts, multiple
replicas), where one process's save must reach another process's cache.

In practice the mechanism never fired: after the first local save, the
local version was set to `Date.now()`, and the hydration path
short-circuited on `localVersion > 0` **before** ever consulting Redis.
From that moment on, no amount of remote bumps could invalidate the
local snapshot — the one scenario the machinery existed for was exactly
the scenario it could not serve.

## Decision

We accept the single-process deployment model as the design truth and
delete the entire mechanism (`services/version.ts` and the hydration
reconciliation), rather than repairing it. The in-process snapshot is
authoritative once loaded; `refreshBlogSettings` (called on the write
path) remains the only invalidation channel.

Kobato is deployed as a single Docker container or a single SEA binary.
Multi-replica deployments are not a design target.

## Consequences

- Honest architecture: the code now says what it does. No zombie
  mechanism pretending to provide cross-process freshness.
- Do NOT reintroduce a Redis version counter without revisiting this
  ADR. If multi-instance support ever becomes real, the correct shape is
  to consult the shared version **before** the local short-circuit —
  and to prove it with a two-process test, which the deleted machinery
  never had.
- Side effect: one fewer Redis key and one fewer write on every
  settings save. No behavior change for any supported deployment.
