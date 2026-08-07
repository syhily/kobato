# Shared conventions

`src/shared/` is isomorphic, side-effect-free, safe in both bundles.
Forbidden: `node:*`, `drizzle-orm`, DOM-only APIs, direct
`process.env`, `console.*`.

Imports `shared/*` only. Runs in both bundles without polyfills.

Every module in `shared/` is globally importable from any layer
(`server/`, `client/`, `ui/`, `routes/`). Consumers **must** import
directly from the source file — never through a re-export in an
intermediate module. No `export { X } from 'y'` or
`export type { X } from 'y'` patterns.

## Error handling

`shared/` has no logger instance (server and client each bring their
own). If something unexpected happens, **throw an error** and let the
server or client boundary catch and log it.

## Structure

- `config/` — settings sections, defaults, projection, socials
  (`BlogSettingsBundle`).
- `contracts/` — Zod schemas (the wire format) plus the DTO types derived
  from them.
- `types/` — Standalone shared types and isomorphic helpers with no
  contract twin (catalog projections, domain inputs, image URL helpers).
- `pt/` — PortableText schema, bridge, semantics, comment markdown,
  footnote-merge, the footnote anchor DOM contract (`footnote-anchors`),
  editor↔storage footnote sync (`footnote-sync`), the heading
  style↔level table (`heading-levels`), and the request-scoped
  enriched-body overlay (`enriched`).
- `route-warmup/` — warmup manifest file contract (parse, validate,
  chunk collection) shared by the build plugin and the SSR reader.
- `sea/` — SEA embedded-asset key contract (single owner for the writer
  in `scripts/sea/` and the runtime readers under `src/server/`).
- `seo/` — isomorphic meta-tag builders (`meta`, `title-meta`,
  `og-image`) shared by routes, loaders, and the feed/OG renderers.
- `utils/` — `urls`, `safe-url`, `security`, `tools`,
  `formatter`, `pagination`, `toc`, `paths`, `roles`, `user-agent`,
  `chunk-error`, `comment-token`, `footnotes-section-title`, `memo`,
  `theme-cookie`.
- `cache/`, `constants/`, `lib/` — small standalone modules; a few
  top-level files (`slug`, `sanitize-url`, `zod-config`) round out the
  layer.

## Zod DTO single source

Each wire DTO is declared once as a Zod schema in `shared/contracts/`; its
TS type is derived in the same module (`export type AdminPostDto =
z.infer<typeof adminPostDto>`). There are no hand-written DTO twins and no
parity assertions — consumers `import type` the DTO from the owning
contracts module. `shared/types/` keeps only types that have no contract
schema. The `Assert`/`Equals` helpers in `contracts/primitives` remain for
the settings system's compile-time registry checks.

**Exception — the content/admin SSR wire contracts
(`contracts/content.ts` + `contracts/admin.ts`).**
Their output schemas deliberately use `z.custom<T>()` over the historical
loader-data types (and, for admin, the domain-service row/projection types)
instead of full Zod schemas: the inferred output types must EXACTLY match
the historical loader-data shapes (bit-identical SSR rendering — no lossy
partial schema may drift from them), and the primary consumer is the
in-process SSR caller, which never re-serializes the payload. HTTP-path
coverage for these outputs comes from `tests/it/server/http/content-api.test.ts`
(admin outputs follow in `tests/it/server/http/admin-api.test.ts`). Input
schemas — and the redirect/not-modified signal unions in `contracts/content.ts` —
still use real Zod. This exception is scoped to the content/admin SSR
contracts only — every other contracts module follows the single-source
rule above.

## Client API usage

UI calls `orpc.<domain>.<resource>.<verb>(flatInput)` — single flat
input, no `{ body, query, params }` buckets; the `shared/contracts/`
schema validates that input server-side. Errors reach the client as
`ORPCError('CODE', { message })` rejections.
