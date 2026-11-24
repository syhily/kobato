# `@kobato/distribution`

Build-time identity and distribution-artifact contracts shared by the application runtime and packaging tools.

- `app.ts` owns the compile-time `__APP_*__` application identity.
- `sea-assets.ts` is the only owner of SEA embedded-asset keys and codec vocabulary; writers live in `@kobato/pack`,
  readers in `@kobato/server`.
- `route-warmup.ts` owns the client-manifest shape, sentinel, and warmup exclusion patterns shared by build, SSR, and
  browser idle loading.
- `warmup-manifest.ts` owns the `warmup-manifest.json` file contract (parse/validate/chunk walk) consumed by BOTH the
  build plugin in `tools/pack` and the SSR reader in `@kobato/server/render/warmup`.
- No Node runtime, filesystem, packaging implementation, RPC DTOs, or React. This package has no internal dependencies.
- Tests: `tests/unit/` (`shared-unit`, release chain + warmup manifest). The SEA writer/reader contract pins live in
  `tools/pack/tests/unit/sea/` (`pack-unit`); the SEA asset-key cross-package pins live in `apps/kobato/tests/arch/`.
