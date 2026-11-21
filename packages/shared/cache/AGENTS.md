# `@kobato/cache`

The cache DECLARATION layer — not a storage plane. Owner of: `registry` (one `CacheDeclaration` per bucket: stable
`id` = the directory name under `<storage.data>/cache`, UI-message-id `labelId`/`descriptionId`, default prefix/TTL,
`tunable` flag) and `types` (the derived `CacheBucketId` union, `CACHE_BUCKET_IDS`, tunable fallbacks, reserved
read-only bucket metadata — all derived from the registry, never hand-synced).

- Allowed deps: `@kobato/i18n` (UiMessageId), `@kobato/utils` (unsafe-cast). Never the api contracts, settings, or any
  product package.
- Bans: NO file store, L1 memory store, eviction, or lifecycle logic — the on-disk plane, the process-local L1, and the
  behavior registry live in `@kobato/server/src/infra/cache`. This package only declares what buckets exist.
- Tests: `tests/unit/` (`shared-unit`).
