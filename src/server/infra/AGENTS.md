# Infra conventions

`src/server/infra/` holds technical primitives (layer rules live in `../AGENTS.md`). This file pins the contracts that are easy to break: the config-file surface and the SEA runtime asset rules.

## Config file

Infrastructure configuration lives in `kobato.config.json` — auto-created with defaults when missing. `src/server/infra/config.ts`'s `CONFIG_TABLE` maps nested config paths to Zod schemas; consumers read the validated `serverConfig` export. Env var names are derived by convention (`path.join('__')` → `storage__database`).

- Location order: `--config <path>` → SEA `<execDir>/kobato.config.json` → `./kobato.config.json` → `~/.config/kobato.config.json`. First existing wins.
- Precedence: schema defaults < config file < env vars. Env values differing from the file are written back (coerced to native JSON types only when the entry's schema accepts the coercion — a numeric-looking secret stays a string). `security.trustedProxies` rejects `0.0.0.0/0` (it would trust proxy headers from any peer, disabling every per-IP rate limit).
- `VITEST=true` without `--config` → env-only, zero filesystem access.
- Tooling that spawns the binary MUST pass `--config <tempDir>/…` to avoid persisting throwaway config next to the binary.
- Adding a config value: add a `CONFIG_TABLE` row → update `kobato.config.example.json` → cover it in `tests/unit/server/infra/config.test.ts`.

## SEA runtime rules

Build-side mechanics (VFS constraints, bundles, natives, commands) live in `scripts/sea/AGENTS.md`.

- Native packages (sharp, @napi-rs/canvas, @duckdb/node-api) are statically imported like any other dependency — the bundler inlines them and the redirect plugin rewrites their platform loads. The inverted hazard is the OLD pattern: a `requireExternal('sharp' | ...)` call site hides the package from the bundler and crashes under SEA. Enforcement: the boundaries contract test bans native `requireExternal(...)` sites, and the native-specifiers test enumerates every platform `require` in the installed packages so a new specifier fails at upgrade time. `requireExternal` remains only as `nativeRequire`'s resolver.
- Runtime file reads that must work under SEA go through `seaAssetPath` (raw assets, main thread only) or `getEmbeddedAsset` (packed `natives/*` + `natives-meta/*` — the worker-safe channel). Never `seaAssetPath` a `natives/*` key (it throws — zstd bytes). New resource types go into `scripts/sea/assets.ts` AND are read via the sea helpers with a non-SEA fallback.
- Embedded asset keys are owned by `src/shared/sea/assets.ts` — new keys go there; never hardcode one in `scripts/` or `src/server/` (`tests/unit/shared/contracts/sea-assets.test.ts`).
- `KOBATO_NATIVES_DIR` / `KOBATO_CACHE_DIR` are runtime env vars read outside `config.ts`: the SEA runtime modules read them before the validated `serverConfig` snapshot exists (allowlisted in the boundaries test).
