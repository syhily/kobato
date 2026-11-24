# `@kobato/cache`

The cache DECLARATION layer, not a storage plane. `registry` holds one `CacheDeclaration` per bucket (stable `id` = the
directory under `<storage.data>/cache`, UI-message-id `labelId`/`descriptionId`, default prefix/TTL, `tunable` flag);
`types` derives the `CacheBucketId` union, `CACHE_BUCKET_IDS`, tunable fallbacks, and reserved read-only metadata from
the registry — never hand-synced.

- Allowed deps: `@kobato/i18n` (UiMessageId), `@kobato/utils` (unsafe-cast). Never the api contracts, settings, or any
  product package.
- No file store, L1 memory store, eviction, or lifecycle logic — those live in `@kobato/server/src/infra/cache`.
- Tests: `tests/unit/` (`shared-unit`).
