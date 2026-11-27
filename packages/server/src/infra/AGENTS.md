# Infra conventions

`packages/server/src/infra/` holds technical primitives with zero business knowledge: it imports nothing from
`domains/`, `http/`, or `render/`, nothing from `react-router` (no infra module ever names a router type), and must not
name a persistence table, a settings-section field, or a task-domain noun. A module belongs here only while
domain-agnostic — searchable post text, visibility gates, site-origin derivation, and Webmention headers live in
`domains/`. `sea/` owns the SEA runtime (CLI/bootstrap, VFS reads/patches, natives, rollback, self-update gate). There
is no `infra/hono/` — the React Router mount, its dev plugin, and the server-build loader are deleted; the workspace SPA
is served by the package's own Hono app (`http/kobato-app.ts`, booted by `bootstrap/start-kobato.ts`), the backend's dev
host plugin lives in `tools/pack/src/vite/hono-dev-host.ts` (`react-router-hono-server.ts` beside it is sayaka's), and
the generic static-asset cache middleware lives in `http/middlewares/cache.ts`.

- `db/paths.ts` resolves validated config into both engines' paths; `data-paths.ts` is its non-database twin (fonts,
  MaxMind, dead-letter). The engines open in `@kobato/db` — infra owns no engine code. `__setEnginePathsForTests` pins
  both for a test file.
- `lifecycle.ts` installs the process-level `unhandledRejection` handler — streamed loader promises require it; do not
  remove it. `restartServer` re-binds through `http/listener.ts`.
- `dev-host-state.ts` is the run-once state store of the backend dev host (`pnpm dev`): a `globalThis` record behind
  `Symbol.for('kobato.server.dev-host-state')`, present only when `honoDevHost` marked the process (the marker slot is
  set before the entry loads — the module-level guards evaluate before `startKobato` runs, so the store cannot be
  created there). Guards read and write flags (`readDevHostFlag` / `writeDevHostFlag`), carried values
  (`readDevHostValue` returns `unknown` and the caller narrows; `writeDevHostValue` / `deleteDevHostValue`): the
  `ManagedEngine` handles (`bootstrap/db-lifecycle`, `bootstrap/analytics-lifecycle`), the job registry's entries
  (`infra/job-registry`), the scheduler's registered-job list (`infra/scheduler-utils`), and the GeoIP reader promise
  (`domains/analytics/geoip/lookup`). A module whose re-evaluation would duplicate a process-level resource registers
  its cleanup through `onDevHostDispose(key, dispose)` — the key is the module's path under `packages/server/src/`
  (`bootstrap/managed-engine` appends its engine key, as in `bootstrap/managed-engine:handle`), and the previous
  evaluation's callback under the same key runs first. The store is the one carrier: no module under
  `packages/server/src` reads `import.meta.hot` (pinned by `apps/kobato/tests/arch/server-layers.test.ts`) — both dev
  hosts load the graph through `ssrLoadModule` (`hmr: false`) and the SSR build defines it as `undefined`, so a
  `hot.dispose` registration would be dead everywhere and, beside the marker, would run the same cleanup twice. That
  covers the signal and `unhandledRejection` handlers (`infra/lifecycle`), the diagnostics subscriptions
  (`infra/db/query-diagnostics`, `infra/trace/sqlite`), the trace runtime (`infra/trace/runtime` and
  `domains/observability/runtime-manager`: the previous runtime is stopped and the new evaluation starts a fresh one —
  stopped, never leaked), the analytics maintenance job (`bootstrap/analytics-lifecycle`), the batcher instances
  (`infra/db/batcher-registry`), the like-token sweep (`domains/comments/services/likes`), the worker pool
  (`infra/image/process-pool`, stopped so the new evaluation's code spawns the next one), and the shutdown hooks the
  re-evaluated modules register (`infra/scheduler-utils`, `infra/image/process-pool`, `ManagedEngine`). Outside the dev
  host the store is `undefined` and every guard is inert.
- `http/listener.ts` is the one `@hono/node-server` `serve()` call site: `listenHono({ app, onListening })` binds the
  app's fetch on the configured host and port with `overrideGlobalObjects: false` and
  `serverOptions: HTTP_SERVER_OPTIONS` (`@kobato/base/utils/http-server-options`, the one source both Kobato listeners
  share — sayaka's `createHonoServer` binds the same object; the request deadline is the `requestTimeout` middleware's,
  so Node's own stays off). `http/kobato-app.ts` (`listenKobato`, the cold boot) and `lifecycle.ts` (`restartServer`)
  both serve through it — never a second `serve()` options shape.
- Build-time Vite plugins are NOT infra: they live in `tools/pack/src/vite/`. Never import a tool package from here.

## Config file

- `kobato.config.json` is auto-created with defaults when missing. `CONFIG_TABLE` maps nested config paths to Zod
  schemas; consumers read the validated `serverConfig` export. Env var names derive by convention (`__` join →
  `storage__database`); precedence is schema defaults < config file < env vars, and `security.trustedProxies` rejects
  `0.0.0.0/0`.
- `VITEST=true` without `--config` → env-only, zero filesystem access. Tooling that spawns the binary MUST pass
  `--config <tempDir>/…`.
- Adding a config value: `CONFIG_TABLE` row → `kobato.config.example.json` → coverage in
  `packages/server/tests/unit/server/infra/config.test.ts`.
- Observability has ONE configuration source, the `observability` admin settings section — nothing in
  `kobato.config.json` configures it. `trace/config.ts` validates endpoint security (plain HTTP only for loopback or
  private IP literals), then safely disables the affected pipeline.

## SEA runtime rules

- Import native packages through their owning packages — `sharp` and `@napi-rs/canvas` directly, the DuckDB engine
  through `@kobato/db/duckdb/self-check`; server code never imports `@duckdb/node-api` itself. The font-slicing addon is
  the one workspace native: `domains/fonts/vendor/napi-split.ts` loads it through `nativeRequire(FONT_SPLIT_ADDON_SPEC)`
  — a specifier string, never a static import.
- A `requireExternal('sharp' | ...)` call site hides the package from the bundler and crashes under SEA
  (`requireExternal` remains only as `nativeRequire`'s resolver) — banned by the boundaries contract test.
- SEA-safe file reads go through `seaAssetPath` (raw assets, main thread only) or `getEmbeddedAsset` (packed
  `natives/*`, worker-safe). Never `seaAssetPath` a `natives/*` key — it throws on zstd bytes.
- Embedded asset keys are owned by `packages/shared/base/src/distribution/sea-assets.ts`; never hardcode one. New
  resource types go into `tools/pack/src/sea/assets.ts` AND are read via the sea helpers with a non-SEA fallback.
