# `@kobato/settings`

The isomorphic settings model and its single source of truth.

- `sections/<section>.ts` owns each Section's read schema, pure defaults, write-shape schema, scope, and bundle slot. `sections/registry.ts` composes the 19 Sections and owns scope lookup. Section TS types in `types.ts` derive from these schemas; never add hand-written setting-shape twins.
- Read schemas stay migration-tolerant. Strict write rules must not silently reject legacy rows during hydration. The server's `domains/settings/sections/registry.ts` adds server-only write validation (currently the Observability origin/organization gate); persistence, encryption, merge, and install flows stay in `@kobato/server`.
- `secrets.ts` owns `SECRET_FIELDS`, `declareSecret`, redaction, and mask metadata. Encryption and secret-preserving writes stay server-side.
- `projection.ts` owns admin projections and their runtime schemas; loader shapes are `z.infer` derivatives, never parallel interfaces.
- `types.ts` derives the Section aliases and `BlogSettingsBundle` from `SECTION_REGISTRY`; it also owns `SettingsBundle`, `SettingsSectionPatch`, and `SecretMasks`.
- `snapshot`, `app-localization`, `representation-scopes`, `rate-limit-bucket` + `rate-limit-defaults`, `socials`, `presentation` (sidebar/X-handle/display derivations and the footnotes title default), `timezones` remain isomorphic model helpers. The RUM client identity schema lives in `sections/observability.ts`. Admin navigation display metadata belongs to `@kobato/web-admin`, not this package.
- Allowed deps: `@kobato/i18n`, `@kobato/cache`, `@kobato/assets` (the avatar source vocabulary), `@kobato/utils`. Never `@kobato/contracts`, server, db, web, UI, or React.
- Tests: `tests/unit/` under the umbrella `shared-unit` project. Server write/hydration/secret tests remain in `packages/server/tests`; navigation display tests live with the web consumer.
