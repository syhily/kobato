# Shared conventions

`src/shared/` is isomorphic, side-effect-free, and safe in both bundles. Forbidden: `node:*`, `drizzle-orm`, DOM-only APIs, direct `process.env`, `console.*`. Imports `shared/*` only; runs in both bundles without polyfills.

Every module is importable from any layer (`server/`, `client/`, `ui/`, `routes/`). Consumers **must** import directly from the source file — never through a re-export in an intermediate module. No `export { X } from 'y'` or `export type { X } from 'y'`.

## Error handling

`shared/` has no logger instance (server and client each bring their own). If something unexpected happens, **throw an error** and let the server or client boundary catch and log it.

## Structure

- `config/` — settings sections, defaults, projection, socials (`BlogSettingsBundle`), the `observability` origin/site-name grammar shared by the settings write schema and the runtime resolver, and `snapshot`, the process-wide settings snapshot slot.
  - `snapshot.revision` (`<bootId>:<counter>`, `bootId` from `crypto.randomUUID` per process; +1 per successful hydrate/refresh, pre-install included) is request identity / locale sync only — never a cache generation.
  - `representation-scopes` owns the single section→scope dependency table (`detail`, `listing`, `feed`, `calendar`, `og`, `manifest`, `sitemap`, `comments`) plus the pure stable-serialization + FNV-1a hash deriving one content-addressed generation per scope, memoized by bundle identity in a `WeakMap`; same settings → same keys across restarts, unrelated admin saves move nothing.
- `contracts/` — Zod schemas (the wire format) plus the DTO types derived from them.
- `types/` — shared types and isomorphic helpers with no contract twin (catalog projections, domain inputs, image URL helpers, the site-owned asset-URL path grammar in `asset-url`).
- `lexical/` — Lexical storage-format validation; pure zod, no Lexical runtime; `SerializedEditorState` is an erased `import type` from `@/inkling/headless`.
  - `node-whitelist` — the node-type whitelist single source. `schema` is the full article/page state schema and owns `EMPTY_LEXICAL_EDITOR_STATE`; `comment-schema` is the restricted comment schema and owns `EMPTY_COMMENT_EDITOR_STATE` and the shared `isCommentEditorStateBlank` submit gate.
  - `dialect` — `compactLexicalEditorState` slims a full-dialect state for storage by deleting serializer-default keys; the schemas' `normalizeLexicalDialect` preprocess refills them, so both dialects parse to the same full-dialect output.
  - `composer-nodes` — the composer-mounted node-set manifests for ARTICLE and COMMENT, pinned three-way schema ⇐ whitelist ⇐ composer by contract test.
  - Save pipeline — `walk` (pre-order traversal + serialized `getTextContent` parity), `heading-slug` (the `headings` column slug single source, contract-tested against the real `lexicalStateToHtml` export), `collect` (headings / image storage paths / music player ids derived columns), `artifacts` (server-filled node-dataset slot registry), `equivalence` (artifact-blind semantic fingerprint for the save no-op short-circuit; its `lexicalNodeFingerprint` is also the revision diff's pairing anchor).
  - `projection-state` — deep-copy shaping for the headless projection render (feed artifact stripping + defensive host-card substitution for types the projection does not register).
  - `cards/` — React-free host-card specs (`solution`, `two-column`, `music-player`, the `card-html` render helpers, the `menu-matches` constants) and `cards/kobato-image` (KobatoImageNode: the stock eight properties plus `thumbhash`/`storagePath`/`imageId`/`layout`, the full-fidelity + feed exportDOM renderers, and the import spec).
  - Card dataset properties, nested-editor facts, class/copy constants, and exportDOM renderers live in `cards/` as the single source consumed by both the server projection (headless `generateDecoratorNode`) and the client card assembly (`@/inkling` + `defineCard`) — two class objects, one spec.
- `route-warmup/` — warmup manifest file contract (parse, validate, chunk collection) shared by the build plugin and the SSR reader.
- `sea/` — SEA embedded-asset key contract (single owner for the writer in `scripts/sea/` and the runtime readers under `src/server/`).
- `sanitize/` — the isomorphic DOMPurify stack: `config` (per-strategy allowlists, including the server-only `feed` / `comment-email` strategies consumed by `server/render/feed` and `server/domains/comments`, and the `comment` strategy consumed by `ui/public/comments/CommentContentHtml`), `purify-core` (every behavioral rule, shared so SSR and hydration bytes cannot drift), `sanitize-html` (facade: `sanitizeHtmlString` / `sanitizeHtml`), and the two engine bindings.
  - `engine.node.ts` is the one sanctioned exception to this layer's no-node-dependency rule: it imports jsdom, and the `sanitize-html-engine-alias` vite plugin swaps the specifier to `engine.browser.ts` in the client bundle (pinned by `tests/unit/arch/client-bundle.test.ts`'s jsdom `allowedIn` entry).
- `seo/` — isomorphic meta-tag builders (`meta`, `title-meta`, `og-image`) shared by routes, loaders, and the feed/OG renderers.
- `i18n/` — the locale contract and message catalogs.
  - `locales` — the four supported tags, alias normalization, `og:locale` spelling, endonym labels.
  - `content-language` — any well-formed BCP 47 tag via `Intl.getCanonicalLocales`, blank = unset; author metadata for the detail body's `lang`, never a UI-locale selector and never an enum of the four supported locales.
  - `messages/ui/*` and `messages/server/*` — English defines the message-id types, the other three `satisfies` them.
  - `catalog` — aggregation + English fallback merge + ICU validation; server-only value import (the client receives one locale's UI catalog from the root loader).
  - `uiMessagesForScope(locale, scope)` — memoized per `locale:scope` and frozen: workspace scope is the complete catalog, public scope is the positive `PUBLIC_MESSAGE_PREFIXES` allowlist in `catalog-scope` (`auth`/`common`/`error`/`meta`/`notifications`/`public`/`validation` plus the shared notifications drawer's `admin.toast.*` action toasts). Callers share the object and must never mutate it; a new admin panel namespace is workspace-only by default, and `tests/unit/arch/public-message-namespaces.test.ts` proves no public module resolves a key outside the allowlist.
  - `catalog-scope` — the client-safe `public | workspace` classifier: `/admin` and `/editor` are workspace, every other pathname public.
  - `fallback-messages` — the only message module the client may import directly: the root ErrorBoundary copy plus the no-payload meta fallbacks (pre-install title and page `article:section`).
  - `app-localization` — `resolveAppLocalization` (the single locale + site-time-zone + `timeFormat` + snapshot-`revision` resolver) and `createLazyAppSnapshot`, the per-request memo that pins the settings bundle AND the localization, including its `revisions`, in one capture.
  - `feature-flags` — `I18N_SETTINGS_ENABLED`, the General language selector.
  - `inkling-labels` + `inkling-labels/*` — the editor chrome's own flat tables (English baseline + three translations; every key held to `KobatoInklingLabelKey`), kept OUT of the ICU catalogs because Inkling's `{max}`/`{cardType}`/`{name}`/`{progress}` tokens are `string.replace`, not ICU.
  - The `inkling-labels` aggregator is a server-only value import: `content.bootstrap` ships ONLY the active locale's table as `i18n.inklingLabels`, and only to a signed-in workspace document; public documents load the active locale's chunk through `@/client/editor/inkling-labels` on interaction. No client module may statically import a table (`tests/unit/arch/client-bundle.test.ts`).
  - `format` — the ONE display-formatting facade (dates in an explicit locale + site zone, numbers, byte sizes, durations, relative time incl. the recent-date buckets, DisplayNames, collation). UI code never calls `toLocale*`, `Intl.*` formatters or date-fns relative formatting directly; `utils/formatter` keeps only the site-zone date primitives plus the `formatShowDate` compatibility wrapper.
  - Display registries (`config/display`, `cache/registry`, `utils/roles`, `utils/sessions-sort`, `ui/admin/tasks/meta`, `ui/shared/notifications/notification-meta`) hold message ids, never copy; the consumer resolves them with its own `t`. The server translator lives in `server/infra/i18n`; `shared/seo/title-meta` takes message ids and resolves them from the root loader's `i18n` payload via `matches`. The AST guard for hardcoded copy is `tests/_helpers/i18n-literals`.
- `contracts/api-error` — the transport error contract both adapters and the client share: `ErrorMessageDescriptor` (`messageKey`/`params`/`fallbackMessage`), `ErrorIssueWire` (+ the request-locale `message`, `code`/`path`), `ApiErrorData` (`{ descriptor, issues }`). Producers state a typed id; the server translates per request, so every issue carries BOTH the display `message` (never the key) and the descriptor for new consumers (field mapping / re-localization).
  - `utils/zod-issue-bounds` exposes `zodIssueParams`, the ONE issue-params extractor both sides use: it merges the `{min}`/`{max}` numeric bounds a shared validation schema's issue carries with a custom issue's explicit `params` bag, keeps only the wire's primitives (`string | number | boolean | null`) and lets an explicit param win over a derived bound.
  - The client interpolates issue params through `useI18n().localizeMessage(value, params)` (react-intl only; a missing param logs and degrades to a generic localized sentence, never a token name / raw template / id) and the server puts them on the wire. `utils/api-error` also exposes `apiErrorDescriptorKey` — the stable `messageKey` a client branch compares against (e.g. the backup password prompt); legacy raw/array-data rejections return `undefined`.
- `utils/` — `urls`, `safe-url`, `security`, `tools`, `formatter`, `pagination`, `toc`, `paths`, `roles`, `chunk-error`, `comment-token`, `footnotes-section-title`, `memo`, `theme-cookie`.
- `cache/`, `constants/`, `lib/` — small standalone modules; top-level files (`slug`, `sanitize-url`, `zod-config`) round out the layer.

## Zod DTO single source

Each wire DTO is declared once as a Zod schema in `shared/contracts/`; its TS type is derived in the same module (`export type AdminPostDto = z.infer<typeof adminPostDto>`). There are no hand-written DTO twins and no parity assertions — consumers `import type` the DTO from the owning contracts module. `shared/types/` keeps only types that have no contract schema. The `Assert`/`Equals` helpers in `contracts/primitives` remain for the settings system's compile-time registry checks.

Exception — the content/admin SSR wire contracts (`contracts/content.ts` + `contracts/admin.ts`): their output schemas use `z.custom<T>()` over the loader-data types (and, for admin, the domain-service row/projection types) instead of full Zod schemas, because the inferred output types must EXACTLY match the loader-data shapes (bit-identical SSR rendering) and the primary consumer is the in-process SSR caller, which never re-serializes the payload. HTTP-path coverage for these outputs is `tests/it/server/http/content-api.test.ts` (admin outputs: `tests/it/server/http/admin-api.test.ts`). Input schemas — and the redirect/not-modified signal unions in `contracts/content.ts` — still use real Zod. Scoped to these two modules only.

## Client API usage

UI calls `orpc.<domain>.<resource>.<verb>(flatInput)` — single flat input, no `{ body, query, params }` buckets; the `shared/contracts/` schema validates that input server-side. Errors reach the client as `ORPCError('CODE', { message })` rejections.
