# `@kobato/settings`

The isomorphic settings model and its single source of truth.

- `sections/<section>.ts` owns each Section's read schema, pure defaults, write-shape schema, scope, and bundle slot.
  `sections/registry.ts` composes the 19 Sections and owns scope lookup. Section TS types in `types.ts` derive from
  these schemas; never add hand-written setting-shape twins.
- Read schemas stay migration-tolerant. Strict write rules must not silently reject legacy rows during hydration. The
  server's `domains/settings/sections/registry.ts` adds server-only write validation (currently the Observability
  origin/organization gate); persistence, encryption, merge, and install flows stay in `@kobato/server`.
- `secrets.ts` owns `SECRET_FIELDS`, `declareSecret`, redaction, and mask metadata. Encryption and secret-preserving
  writes stay server-side.
- `projection.ts` owns admin projections and their runtime schemas; loader shapes are `z.infer` derivatives, never
  parallel interfaces.
- `types.ts` derives the Section aliases and `BlogSettingsBundle` from `SECTION_REGISTRY`; it also owns
  `SettingsBundle`, `SettingsSectionPatch`, and `SecretMasks`.
- `snapshot`, `app-localization`, `representation-scopes`, `rate-limit-bucket` + `rate-limit-defaults`, `socials`,
  `presentation`, `timezones` remain isomorphic model helpers. The RUM client identity schema lives in
  `sections/observability.ts`. Admin navigation display metadata belongs to `@kobato/web-admin`, not this package.
- `telemetry/` is the observability protocol layer — `rum.ts` (browser-safe RUM bootstrap + same-origin intake
  vocabulary), `logs.ts` / `metrics.ts` / `pipeline.ts` (OpenObserve stream, metric, and privacy-pipeline identity). It
  lives here for locality with the observability configuration: `sections/observability.ts` owns the RUM client identity
  the bootstrap schema composes. Runtime SDK adapters stay with their consumers (server `infra/trace/`, web-client
  `lib/rum/`); local container tooling lives in `@kobato/trace`. No OpenTelemetry SDK, OpenObserve client, Docker,
  retention mutation, or server config.
- Allowed deps: `@kobato/i18n`, `@kobato/cache`, `@kobato/assets` (the avatar source vocabulary), `@kobato/utils`. Never
  `@kobato/api` (the wire contracts), server, db, web, UI, or React.
- Tests: `tests/unit/` (`shared-unit`). `tests/utils/blog-settings.ts` is the WORKSPACE-canonical settings fixture
  (`TEST_BLOG_SETTINGS_BUNDLE`, `setBlogSettingsBundleForTests`, `resetBlogSettingsForTests`) — every other package's
  test trees import it cross-package, never keep a copy. `tests/utils/setup/{unit,snaps}.ts` owns the shared projects'
  settings reset wrappers. Server write/hydration/secret tests remain in `packages/server/tests`; navigation display
  tests live with the web consumer.
