# `@kobato/settings`

The isomorphic settings model and its single source of truth.

- `sections/<section>.ts` owns each Section's read schema, pure defaults, write-shape schema, scope, and bundle slot;
  `sections/registry.ts` composes the 19 Sections and owns scope lookup. `types.ts` derives the Section aliases,
  `SettingsBundle`, and `BlogSettingsBundle` from `SECTION_REGISTRY` — never add hand-written setting-shape twins.
- Read schemas stay migration-tolerant: strict write rules must not silently reject legacy rows during hydration. The
  server's `domains/settings/sections/registry.ts` adds server-only write validation; persistence, encryption, merge,
  and install flows stay in `@kobato/server`.
- `secrets.ts` owns `SECRET_FIELDS`, `declareSecret`, redaction, and mask metadata; encryption and secret-preserving
  writes stay server-side. `projection.ts` owns admin projections and their runtime schemas; loader shapes are `z.infer`
  derivatives, never parallel interfaces.
- `csp.ts` is the single CSP builder (`buildCspHeader` / `siteUsesHttps`) shared by kobato's HTTP perimeter and sayaka's
  document perimeter; it derives every origin from the bundle's asset host and configured website and NEVER widens
  `connect-src 'self'`.
- `telemetry/` is the observability protocol layer: the browser-safe RUM bootstrap (relay placeholder token; the client
  identity schema is `sections/observability.ts`) and the OpenObserve stream/metric/pipeline identity. The intake path
  and SDK proxy URL builder belong to `@kobato/api`; runtime SDK adapters stay with their consumers. No OpenTelemetry
  SDK, OpenObserve client, Docker, retention mutation, or server config.
- Admin navigation display metadata belongs to the workspace admin UI (`apps/kobato/src/ui`), not this package.
- `cache-registry.ts` + `cache-bucket.ts` are the cache DECLARATION layer, never a storage plane: one `CacheDeclaration`
  per bucket (stable `id` = the directory under `<storage.data>/cache`, UI-message-id `labelId`/`descriptionId`, default
  prefix/TTL, `tunable` flag); `cache-bucket.ts` derives the `CacheBucketId` union, `CACHE_BUCKET_IDS`, tunable
  fallbacks, and the reserved read-only buckets from the registry — never hand-synced. No file store, L1 memory store,
  eviction, or lifecycle logic here — those live in `@kobato/server/src/infra/cache`. The admin `cache` Section
  (`sections/cache.ts`) and the admin clear-cache contract read the declarations.
- Allowed deps: `@kobato/i18n`, `@kobato/base`. Never `@kobato/api`, server, db, web, UI, or React.
- Tests: `tests/unit/` (`shared-unit`). `tests/utils/blog-settings.ts` is the WORKSPACE-canonical settings fixture —
  import it cross-package, never keep a copy. `tests/utils/setup/{unit,snaps}.ts` owns the shared projects' settings
  reset wrappers. Server write/hydration/secret tests remain in `packages/server/tests`.
