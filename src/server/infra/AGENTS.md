# Infra conventions

`src/server/infra/` holds technical primitives with zero business knowledge: it imports nothing from `domains/`, `http/`, or `render/`. Layer rules live in `../AGENTS.md`.

## Config file

- `kobato.config.json` is auto-created with defaults when missing. `config.ts`'s `CONFIG_TABLE` maps nested config paths to Zod schemas; consumers read the validated `serverConfig` export. Env var names derive by convention (`__` join → `storage__database`).
- Location order: `--config <path>` → `KOBATO_CONFIG_FILE` (dev tooling; resolved against cwd, treated as explicit) → SEA `<execDir>/kobato.config.json` → `./kobato.config.json` → `~/.config/kobato.config.json`. First existing wins unless an explicit `--config`/env path was supplied.
- Precedence: schema defaults < config file < env vars. Env values differing from the file are written back, coerced to native JSON types only when the entry's schema accepts the coercion (a numeric-looking secret stays a string). `security.trustedProxies` rejects `0.0.0.0/0` — it would trust proxy headers from any peer and disable every per-IP rate limit.
- `VITEST=true` without `--config` → env-only, zero filesystem access. Tooling that spawns the binary MUST pass `--config <tempDir>/…` so throwaway config is never persisted next to the binary.
- Adding a config value: `CONFIG_TABLE` row → `kobato.config.example.json` → coverage in `tests/unit/server/infra/config.test.ts`.
- Observability has ONE configuration source, the `observability` admin settings section; nothing in `kobato.config.json` configures it. `trace/config.ts` is a pure resolver over that projection — it validates endpoint security (plain HTTP only for loopback or a private/reserved IP literal, any hostname still requires HTTPS), the organization path grammar, credential completeness, and sampling ranges, then safely disables the affected pipeline and logs field names only. The domain composes `Basic base64(username:password)`; infra sees only the finished header.

## SEA runtime rules

- Build-side mechanics (VFS constraints, bundles, natives, commands) live in `scripts/sea/AGENTS.md`. Native packages (`sharp`, `@napi-rs/canvas`, `@duckdb/node-api`) are statically imported — the bundler inlines them and the redirect plugin rewrites their platform loads; a `requireExternal('sharp' | ...)` call site hides the package from the bundler and crashes under SEA. `requireExternal` remains only as `nativeRequire`'s resolver.
- Enforcement: the boundaries contract test bans native `requireExternal(...)` sites, and the native-specifiers test enumerates every platform `require` in the installed packages so a new specifier fails at upgrade time.
- SEA-safe file reads go through `seaAssetPath` (raw assets, main thread only) or `getEmbeddedAsset` (packed `natives/*` + `natives-meta/*`, the worker-safe channel). Never `seaAssetPath` a `natives/*` key — it throws on zstd bytes. New resource types go into `scripts/sea/assets.ts` AND are read via the sea helpers with a non-SEA fallback.
- Embedded asset keys are owned by `src/shared/sea/assets.ts`; never hardcode one in `scripts/` or `src/server/` (`tests/unit/shared/contracts/sea-assets.test.ts`).
- `KOBATO_NATIVES_DIR` / `KOBATO_CACHE_DIR` are read outside `config.ts`, before the validated `serverConfig` snapshot exists (allowlisted in the boundaries test).
