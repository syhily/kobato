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
  contract twin (catalog projections, domain inputs, image URL helpers,
  the site-owned asset-URL path grammar in `asset-url`).
- `lexical/` — Lexical storage-format validation for the inkling migration
  (plan `docs/plans/inkling-editor-replacement.md`, R7): the node-type
  whitelist single source (`node-whitelist`), the full article/page state
  schema (`schema` — also owns `EMPTY_LEXICAL_EDITOR_STATE`), the restricted
  comment state schema (`comment-schema` — also owns
  `EMPTY_COMMENT_EDITOR_STATE` and the shared `isCommentEditorStateBlank`
  submit gate), and the composer-mounted node-set
  manifests (`composer-nodes` — ARTICLE (R11) and COMMENT (R12) are both
  live, pinned three-way schema ⇐ whitelist ⇐ composer by contract test). Pure
  zod — no lexical runtime dependency; the `SerializedEditorState` type is an
  erased `import type` from `@inkling/editor/headless`. R9a added the
  save-pipeline modules on top:
  `walk` (pre-order traversal + serialized `getTextContent` parity),
  `heading-slug` (byte-exact port of inkling's slugify + dedup tracker —
  the `headings` column's slug single source, contract-tested against the
  real `lexicalStateToHtml` export), `collect` (headings / image storage
  paths / music player ids derived columns), `artifacts` (server-filled
  node-dataset slot registry), and `equivalence` (artifact-blind semantic
  fingerprint for the save no-op short-circuit — its exported
  `lexicalNodeFingerprint` is also the revision diff's pairing anchor).
  R9b added
  `projection-state` — deep-copy shaping for the headless projection render
  (feed artifact stripping + defensive host-card substitution for types the
  projection does not register). R10 added `cards/` — the React-free host-card
  spec modules (`solution`, `two-column`, `music-player`, plus the `card-html`
  render helpers and the `menu-matches` constants); R11 added
  `cards/kobato-image` (the KobatoImageNode spec: the stock eight properties
  verbatim plus the four kobato keys `thumbhash`/`storagePath`/`imageId`/
  `layout`, the full-fidelity + feed exportDOM renderers, and the import
  spec). Each card's dataset
  properties, nested-editor facts, class/copy constants, and exportDOM
  renderer live here as the single source consumed by BOTH the server
  projection (headless `generateDecoratorNode`) and the client card assembly
  (`.` entry + `defineCard`) — two class objects, one spec, because the dist
  entries ship separate Lexical copies.
- `pt/` — PortableText schema, semantics, footnote-merge, the footnote anchor
  DOM contract (`footnote-anchors`), editor↔storage footnote sync
  (`footnote-sync`), and the heading style↔level table (`heading-levels`). The legacy comment
  dialect (`comment-schema`) still types pre-R12 comment rows — the mail
  templates render them via `comment-to-html` until R14 and
  `commentBodyPlainText` dual-reads them until the body backfill lands. (The
  request-scoped enriched-body overlay and the PT SSR renderer were retired
  in R13 with the switch to the saved `bodyHtml` projection; the PT ↔ ProseMirror bridge
  and `comment-markdown` were retired in R12 with the tiptap comment
  editor.)
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
