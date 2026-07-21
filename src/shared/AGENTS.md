# Shared conventions

`src/shared/` is isomorphic, side-effect-free, safe in both bundles.
Forbidden: `node:*`, `ioredis`, `drizzle-orm`, DOM-only APIs, direct
`process.env`, `console.*`.

Imports `shared/*` only. Runs in both bundles without polyfills.

Every module in `shared/` is globally importable from any layer
(`server/`, `client/`, `ui/`, `routes/`). Consumers **must** import
directly from the source file — never through a re-export in an
intermediate module. No `export { X } from 'y'` or
`export type { X } from 'y'` patterns.

## Error handling

Never use `console.error`, `console.warn`, or `console.log` in shared
modules. `shared/` has no logger instance (server and client each bring
their own). If something unexpected happens, **throw an error** and let
the server or client boundary catch and log it.

## Structure

- `config/` — `blog`, `settings`, `socials` (BlogSettingsBundle).
- `contracts/` — Zod schemas (the wire format).
- `types/` — DTO interfaces (parity-checked against `contracts/`).
- `pt/` — PortableText schema, bridge, semantics, comment markdown,
  footnote-merge.
- `route-warmup/` — warmup manifest file contract (parse, validate,
  chunk collection) shared by the build plugin and the SSR reader.
- `sea/` — SEA embedded-asset key contract (single owner for the writer
  in `scripts/sea/` and the runtime readers under `src/server/`).
- `utils/` — `urls`, `safe-url`, `security`, `tools`,
  `formatter`, `pagination`, `toc`, `paths`, `roles`, `user-agent`,
  `chunk-error`, `comment-token`, `footnotes-section-title`.

## Zod / Type parity

Zod DTOs in `shared/contracts/` are paired with compile-time
`Equals<z.infer, TInterface>` parity assertions against
`src/shared/types/*.ts`. Drift becomes a build error.

## Client API usage

UI calls `api.<domain>.<resource>.<verb>(flatInput)` — single flat
input, no `{ body, query, params }` buckets. Unwrap via `unwrap()`
from `@/client/api/unwrap`. Errors are `ORPCError('CODE', { message })`;
`unwrap()` bridges to `ApiError(message, status, issues)`.
