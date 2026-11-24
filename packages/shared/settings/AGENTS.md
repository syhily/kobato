# `@kobato/settings`

The isomorphic settings model and its single source of truth.

- `sections/<section>.ts` owns each Section's read schema, pure defaults, write-shape schema, scope, and bundle slot;
  `sections/registry.ts` composes the 19 Sections and owns scope lookup. Section TS types in `types.ts` derive from
  these schemas — never add hand-written setting-shape twins.
- Read schemas stay migration-tolerant: strict write rules must not silently reject legacy rows during hydration. The
  server's `domains/settings/sections/registry.ts` adds server-only write validation; persistence, encryption, merge,
  and install flows stay in `@kobato/server`.
- `secrets.ts` owns `SECRET_FIELDS`, `declareSecret`, redaction, and mask metadata; encryption and secret-preserving
  writes stay server-side.
- `projection.ts` owns admin projections and their runtime schemas; loader shapes are `z.infer` derivatives, never
  parallel interfaces.
- `types.ts` derives the Section aliases and `BlogSettingsBundle` from `SECTION_REGISTRY` and owns `SettingsBundle`,
  `SettingsSectionPatch`, and `SecretMasks`.
- Isomorphic model helpers: `snapshot`, `app-localization`, `representation-scopes`, `rate-limit-bucket` +
  `rate-limit-defaults`, `socials`, `presentation`, `timezones`.
- `telemetry/` is the observability protocol layer: `rum.ts` (browser-safe RUM bootstrap + relay placeholder token; the
  client identity schema is `sections/observability.ts`), `logs.ts` / `metrics.ts` / `pipeline.ts` (OpenObserve stream,
  metric, and privacy-pipeline identity). The intake path and SDK proxy URL builder belong to `@kobato/api`; runtime SDK
  adapters stay with their consumers (server `infra/trace/`, web-client `lib/rum/`). No OpenTelemetry SDK, OpenObserve
  client, Docker, retention mutation, or server config.
- Admin navigation display metadata belongs to `@kobato/web-admin`, not this package.
- Allowed deps: `@kobato/i18n`, `@kobato/cache`, `@kobato/assets`, `@kobato/utils`. Never `@kobato/api`, server, db,
  web, UI, or React.
- Tests: `tests/unit/` (`shared-unit`). `tests/utils/blog-settings.ts` is the WORKSPACE-canonical settings fixture
  (`TEST_BLOG_SETTINGS_BUNDLE`, `setBlogSettingsBundleForTests`, `resetBlogSettingsForTests`) — import it cross-package,
  never keep a copy. `tests/utils/setup/{unit,snaps}.ts` owns the shared projects' settings reset wrappers. Server
  write/hydration/secret tests remain in `packages/server/tests`.
