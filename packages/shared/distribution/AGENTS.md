# `@kobato/distribution`

Build-time identity and distribution-artifact contracts shared by the application runtime and packaging tools.

- `app.ts` owns the compile-time `__APP_*__` application identity.
- `sea-assets.ts` is the only owner of SEA embedded-asset keys and codec vocabulary; writers live in `@kobato/pack`, readers in `@kobato/server`.
- `route-warmup.ts` owns the client-manifest shape, sentinel, and warmup exclusion patterns shared by build, SSR, and browser idle loading.
- No Node runtime, filesystem, packaging implementation, RPC DTOs, or React. This package has no internal dependencies.
- Tests: `tests/unit/` under `shared-unit`, including the SEA writer/reader contract pins.
