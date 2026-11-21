# Infra conventions

`packages/server/src/infra/` holds technical primitives with zero business knowledge: it imports nothing from
`domains/`, `http/`, or `render/`, and must not name a persistence table, a settings-section field, or a task-domain
noun. `sea/` owns the SEA runtime (CLI/bootstrap, VFS reads/patches, natives, rollback, self-update gate) including its
CLI-only probes (`doctor-report.ts`, `intl-probe.ts`).

- `db/paths.ts` resolves validated config into BOTH engines' paths (`resolveDatabasePath` / `resolveAnalyticsPath`);
  `__setEnginePathsForTests` pins both for a test file. `data-paths.ts` is its non-database twin (fonts, MaxMind,
  dead-letter). The engines open in `@kobato/db` — infra owns no engine code.
- Build-time Vite plugins are NOT infra: they live in `tools/toolchain/src/vite/` (`react-compiler-plugin.ts`,
  `route-warmup.ts`). Never import a tool package from here.
- A module belongs here only while domain-agnostic — searchable post text, visibility gates, site-origin derivation, and
  Webmention headers live in `domains/`.

## Config file

- `kobato.config.json` is auto-created with defaults when missing. `CONFIG_TABLE` maps nested config paths to Zod
  schemas; consumers read the validated `serverConfig` export. Env var names derive by convention (`__` join →
  `storage__database`).
- Location order: `--config <path>` → `KOBATO_CONFIG_FILE` → SEA `<execDir>/kobato.config.json` → `./kobato.config.json`
  → `~/.config/kobato.config.json`; first existing wins.
- Precedence: schema defaults < config file < env vars. Env values differing from the file are written back, coerced to
  native JSON types only when the schema accepts it. `security.trustedProxies` rejects `0.0.0.0/0`.
- `VITEST=true` without `--config` → env-only, zero filesystem access. Tooling that spawns the binary MUST pass
  `--config <tempDir>/…`.
- Adding a config value: `CONFIG_TABLE` row → `kobato.config.example.json` → coverage in
  `packages/server/tests/unit/server/infra/config.test.ts`.
- Observability has ONE configuration source, the `observability` admin settings section — nothing in
  `kobato.config.json` configures it. `trace/config.ts` validates endpoint security (plain HTTP only for
  loopback/private IP literals), org path grammar, credential completeness, and sampling ranges, then safely disables
  the affected pipeline. The domain composes the auth header; infra sees only the finished value.

## SEA runtime rules

- Build-side mechanics live in `tools/pack/AGENTS.md`. Native packages (`sharp`, `@napi-rs/canvas`, `@duckdb/node-api`)
  are statically imported — a `requireExternal('sharp' | ...)` call site hides the package from the bundler and crashes
  under SEA; `requireExternal` remains only as `nativeRequire`'s resolver. The boundaries contract test bans such sites;
  the native-specifiers test enumerates every platform `require` so a new specifier fails at upgrade time.
- SEA-safe file reads go through `seaAssetPath` (raw assets, main thread only) or `getEmbeddedAsset` (packed
  `natives/*`, worker-safe). Never `seaAssetPath` a `natives/*` key — it throws on zstd bytes. New resource types go
  into `tools/pack/src/sea/assets.ts` AND are read via the sea helpers with a non-SEA fallback.
- Embedded asset keys are owned by `packages/shared/distribution/src/sea-assets.ts`; never hardcode one in `scripts/` or
  `packages/server/src/`.
- `KOBATO_NATIVES_DIR` / `KOBATO_CACHE_DIR` are read outside `config.ts`, before the validated snapshot exists
  (allowlisted in the boundaries test).
