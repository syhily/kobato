# Shared conventions

`src/shared/` is isomorphic, side-effect-free, safe in both bundles.
Forbidden: `node:*`, `ioredis`, `drizzle-orm`, DOM-only APIs, direct
`process.env`, `console.*`.

Imports `shared/*` only. Runs in both bundles without polyfills.

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
