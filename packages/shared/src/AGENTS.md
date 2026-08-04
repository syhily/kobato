# Shared conventions

`packages/shared/src/` is isomorphic, side-effect-free, safe in both bundles.
Forbidden: `node:*`, `drizzle-orm`, DOM-only APIs, direct
`process.env`, `console.*`.

Imports `packages/shared/src` modules only. Runs in both bundles without polyfills.

Every module in `packages/shared/src/` is globally importable from any layer
(`packages/server/`, `packages/client/`, `packages/ui/`, both apps' `routes/`). Consumers **must** import
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
- `legacy-pt/` — PortableText schema + canonicalize + comment schema, retained ONLY for the
  PT→Lexical migration window: the dual-shape read path (server converts PT rows through
  `convertPtBodyToLexical`) and the built-in `kobato migrate-pt` migration core
  (`packages/server/src/infra/pt-migration/core.ts`; the one-shot
  `scripts/migrate-pt-to-lexical.ts` is retired). Retired PT modules that are
  GONE: comment markdown, footnote merge/anchors, `enriched`, semantics helpers (`semantics` and
  `footnote-sync` survive as canonicalize deps).
- `lexical/` — Lexical body dialect: schema (`schema.ts`, `lexicalBodySchema`), comment dialect
  (`comment-schema.ts`), node walk (`walk.ts`), footnote anchors/merge/sync ported to the Lexical
  tree (`footnote-anchors.ts`, `footnote-merge-lexical.ts`, `footnote-sync-lexical.ts`), and the
  HTML render manifest (`html-manifest.ts` — the class/data-attribute contract shared by the
  React renderers in `@kobato/editor/lexical-html/` and the string renderers in
  `@kobato/server/render/lexical-html/`).
- `lexical/` dialect core (stage 5 — moved OUT of `packages/editor/lexical-core` so the server
  graph is server→shared only): the custom node classes (`nodes/*.ts`), the editor node
  registries (`body-config.ts`, `comment-config.ts`), the double-gate validators + canonical
  forms (`validate.ts`, `comment-validate.ts`, `canonicalize.ts`, `comment-canonicalize.ts`),
  the comment markdown projection (`comment-markdown.ts`), and the one-way PT→Lexical mapping
  (`mapping.ts`). The nodes are React-free: their decorator views are registered by the editor
  engine through the shared node-view registry (`node-views.ts` — `registerNodeView` /
  `renderNodeView`; editor-side registration in
  `@kobato/editor/engine/lexical/node-views/register-node-views.tsx`), and the export-DOM
  sanitization rides `math-sanitize.ts` (an allowlist walker over
  `sanitize-html-config`'s `'math'` strategy — environment-independent, unlike DOMPurify under
  non-spec parsers). Shared's lexical devDependencies: `lexical`,
  `@lexical/{headless,code,link,list,rich-text,table,markdown,html}`.
- `route-warmup/` — warmup manifest file contract (parse, validate,
  chunk collection) shared by the build plugin and the SSR reader.
- `sea/` — SEA embedded-asset key contract (single owner for the writer
  in `scripts/sea/` and the runtime readers under `packages/server/src/`).
- `seo/` — isomorphic meta-tag builders (`meta`, `title-meta`,
  `og-image`) shared by routes, loaders, and the feed/OG renderers.
- `utils/` — `urls`, `safe-url`, `security`, `tools`,
  `formatter`, `pagination`, `toc`, `paths`, `roles`, `user-agent`,
  `chunk-error`, `comment-token`, `footnotes-section-title`, `memo`.
- `cache/`, `constants/`, `lib/` — small standalone modules; a few
  top-level files (`slug`, `sanitize-url`, `safe-rel`, `sanitize-html-config`, `zod-config`)
  round out the layer. `sanitize-html-config` is the single strategy table for the sanitize
  facades in ui/editor (`lib/sanitize-html*`) and the server node copy
  (`render/sanitize-html*`, pinned by a parity test); `safe-rel` is the
  `_blank` anchor `rel` helper.

## Zod DTO single source

Each wire DTO is declared once as a Zod schema in `shared/contracts/`; its
TS type is derived in the same module (`export type AdminPostDto =
z.infer<typeof adminPostDto>`). There are no hand-written DTO twins and no
parity assertions — consumers `import type` the DTO from the owning
contracts module. `shared/types/` keeps only types that have no contract
schema. The `Assert`/`Equals` helpers in `contracts/primitives` remain for
the settings system's compile-time registry checks.

## Client API usage

UI calls `orpc.<domain>.<resource>.<verb>(flatInput)` — single flat
input, no `{ body, query, params }` buckets; the `shared/contracts/`
schema validates that input server-side. Errors reach the client as
`ORPCError('CODE', { message })` rejections.
