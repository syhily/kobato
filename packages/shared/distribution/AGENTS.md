# `@kobato/distribution`

Build-time identity and distribution-artifact contracts shared by the runtime and the packaging tools. No internal
dependencies; no Node runtime, filesystem, packaging implementation, RPC DTOs, or React.

- `app.ts` — the compile-time `__APP_*__` application identity.
- `sea-assets.ts` — the only owner of SEA embedded-asset keys and codec vocabulary (writers in `@kobato/pack`, readers
  in `@kobato/server` and the two apps): kobato's SPA rides `client/`, sayaka's public-site build rides `sayaka-client/`
  (the sayaka binary embeds only that prefix plus its manifest), drizzle keeps `drizzle/`, natives `natives/` +
  `natives-meta/`, observability `observability/`, and the embedded worker bundles `worker/`.
- `route-warmup.ts` — client-manifest shape, sentinel, and warmup exclusion patterns shared by build, SSR, and browser
  idle loading.
- `warmup-manifest.ts` — the `warmup-manifest.json` contract, `{ version, tier1, tier2 }` (parse/validate/chunk walk),
  written by the build plugin in `tools/pack` and read by the public site's SSR reader
  (`apps/sayaka/src/server/warmup-manifest.ts`); the workspace warms no routes.
- Tests: `tests/unit/` (`shared-unit`). SEA writer/reader pins live in `tools/pack/tests/unit/sea/`; asset-key pins in
  `apps/kobato/tests/arch/`.
