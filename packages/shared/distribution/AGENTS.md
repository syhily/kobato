# `@kobato/distribution`

Build-time identity and distribution-artifact contracts shared by the runtime and the packaging tools. No internal
dependencies; no Node runtime, filesystem, packaging implementation, RPC DTOs, or React.

- `app.ts` — the compile-time `__APP_*__` application identity.
- `sea-assets.ts` — the only owner of SEA embedded-asset keys and codec vocabulary (writers in `@kobato/pack`, readers
  in `@kobato/server`).
- `route-warmup.ts` — client-manifest shape, sentinel, and warmup exclusion patterns shared by build, SSR, and browser
  idle loading.
- `warmup-manifest.ts` — the `warmup-manifest.json` contract (parse/validate/chunk walk) consumed by the build plugin in
  `tools/pack` and the SSR reader in `@kobato/server/render/warmup`.
- Tests: `tests/unit/` (`shared-unit`). SEA writer/reader pins live in `tools/pack/tests/unit/sea/`; asset-key pins in
  `apps/kobato/tests/arch/`.
