# Inkling editor layer

## Overview

- `packages/inkling/src/` is kobato's rich-text editor (Lexical 0.53, React 19). It owns the stored document model
  (`src/headless/`, React-free), the comment surface beside that model (`src/comment/`), and the kobato host cards
  (`src/host-cards/`). It imports only `@kobato/ui`, `@kobato/i18n`, `@kobato/distribution`, `@kobato/assets`,
  `@kobato/sanitize`, `@kobato/utils` — never contracts, server, db, or web.
- Four public entry surfaces (`apps/kobato/tests/arch/package-dag.test.ts`): `@kobato/inkling` (React barrel
  `src/index.ts`), `@kobato/inkling/headless` + per-file imports (`src/headless/`, React-free — the only editor surface
  `server`/`db`/`contracts`/`catalog` may use), `@kobato/inkling/host-cards` (side-effect registration + image node +
  music base class), and `@kobato/inkling/comment/*` (per-file imports into `src/comment/`, the comment surface). The
  barrel's top-level `registerCardDecorateAdapter()` call MUST stay explicit; the comment composer
  (`src/comment/CommentBodyEditor.tsx`) makes the same call because it renders cards in apps that never load the barrel
  (sayaka) — the registration is idempotent, so whichever entry loads first installs the adapter. The barrel never
  re-exports host-cards or the comment surface (the composer and its editor island ride a lazy chunk).
- Composer: the Lexical EXTENSION API, not `LexicalComposer`. `InklingComposerBase` mounts `LexicalExtensionComposer`
  with the root extension from `src/components/inkling-root-extension.ts`; `contentEditable={null}` (RichTextPlugin owns
  the editable); decorators render through `ReactExtension`, so the root extension wires the `ErrorBoundary`.
  Composer-owned Providers wrap the composer itself — Providers under `children` are invisible to cards and nested
  editors. Freeze the extension per mount via a lazy `useState` initializer. `InklingHostComposer` is the composer a
  host mounts: an `InklingComposer` that reads locale and dark mode from `@kobato/ui`'s `useI18n` / `useTheme` and takes
  `labels` as an explicit prop — the one place that binding lives, never a host copy.

## Essential commands

```bash
pnpm run lint        # oxlint: lint + type check (root config), also covers tests/inkling
pnpm test:inkling    # editor tests through the root Vitest config
pnpm run fmt
pnpm demo
```

## Code style

`oxfmt`/`oxlint` are configured only at the kobato root; the root oxlint config scopes inkling exceptions in a
`packages/inkling/src/**` override. Single quotes, no semicolons, print width 120; Tailwind scoped under
`.inkling-lexical`. `verbatimModuleSyntax` makes `import type` mandatory. A tsconfig edit that floods tests with
`TS2339` means the lint type checker's cached program is stale — re-run `pnpm run lint` once.

## Directory and naming

- `hooks/` and `services/` at the source root are real editor-island layers (the root ban does not apply).
  `nodes/base/nodes/<card>/` mirrors upstream Lexical (the doubled `nodes/` is intentional). `$`-prefixed helpers are
  Lexical idioms; `.declaration.ts` is the card-declaration suffix; non-component modules are `kebab-case.ts`,
  components `PascalCase.tsx`.
- Nine internal `index.ts` alias seams (`nodes/base`, `nodes/base/nodes/at-link`, `nodes/cards`, `transforms`,
  `markdown`, `html/html-to-lexical`, `html/clean-basic-html`, `html/renderer/transformers`, `utils`) are load-bearing
  module entries — keep them and import through them.
- `transforms/` is flat; `utils/` holds pure helpers plus `utils/draggable/` only; `services/` is the React-free
  request-machine layer.
- `src/index.ts` exports the editor's full API, not today's consumer subset — "unused in kobato" is not dead surface.
  Extend it only with deliberately-public API, single-sourced in `src/shared-exports.ts`: today that also covers the
  editor platform both composers share — `InklingHostComposer`, `useEditorSurface` (+ `useEditorBodyReset`),
  `excludeBaseNodes`, `blockQuoteAsideCycle`, and `loadInklingLabels`.

## Architecture

Glossary owned here: **card**, **card adjacency**, **card spec**, **card declaration**, **render target**, **host
card**, **artifact slot**, **render-time meta**.

### Internal layer order

`nodes/` is the model core; `components/` renders it, `plugins/` + `transforms/` mutate it, `context/` carries state,
`hooks/` is React glue, `services/` the machines, `html/` + `markdown/` the serialization planes, `headless/` the
React-free model, `comment/` the comment surface over it, `host-cards/` the kobato assemblies. `headless/` is the one
hard floor: React-free at the runtime-closure level (`tests/unit/headless/headless-boundary.test.ts`).

### Editor platform (`InklingHostComposer`, `hooks/`, `nodes/exclude-base-nodes.ts`, `labels/load-inkling-labels.ts`)

- `InklingHostComposer` is the host-facing composer: it spreads an `InklingComposer` and owns the `@kobato/ui` binding —
  `useI18n().locale` drives `wordCountLanguage` and `emojiLocale`, `useTheme().resolvedTheme` drives `darkMode`, and
  `labels` is an explicit prop. Both composers (the comment composer here, the workspace page composer) mount it; a host
  never re-implements the binding.
- `useEditorSurface` composes `useEditorBodyReset`: the mount-time seed (`prepareSeed`), the `bodyKey` reseed, the
  `registerAPI` editor instance, and the serialized `handleChange`. Both composers are its only consumers — never
  duplicate it in a host.
- `excludeBaseNodes` (`nodes/exclude-base-nodes.ts`, beside the node sets) filters `EDITOR_BASE_NODES` by `getType`,
  honouring `{ replace }` pairs; `blockQuoteAsideCycle` (`hooks/`) is the composer-root Ctrl+Q capture both hosts mount.
- `loadInklingLabels(locale)` is the ONE sanctioned dynamic import of a kobato overlay table
  (`@kobato/i18n/inkling-labels/<locale>`): one chunk per locale, no static table import anywhere in the client
  (`apps/kobato/tests/arch/client-bundle.test.ts`). Reading the same tables off a consumer's root route is host glue and
  lives in the host (`apps/kobato/src/ui/shared/use-inkling-labels`).

### Card pipeline

- Cards collapse to declarations (`src/nodes/cards/*.declaration.ts`); `assembleCardNodeOnce` assembles the class once
  per card; `CARD_WRAPPER_NODES` derives from `CARD_DECLARATIONS`.
- `src/nodes/*Node.ts` are type-only shims (assembled class, `$is*`, dataset type). Behaviour sits on the declaration
  (menu/insert/markdown) or the base class; nested-editor/transient specs adopt via class statics.
- Derived views go through `resolveCardFacts` (`src/nodes/cards/card-facts.ts`, built-in first, host fallback):
  `card-commands.ts` (exhaustive by node type), menu/drag-icon registries, decorate targets, and the fence payload
  table. Spec arrays live in the base node module (`as const satisfies`); `CardSpecFieldMap` derives the shim's `__*`
  names — renaming or retyping an entry is a compile error.
- Adding a card = a declaration plus the touch points in `src/nodes/cards/index.ts` (render export, command constant,
  labels keys, fence payload). Pins:
  `tests/unit/nodes/card-{cross-registry-consistency,declarations,layering-imports}.test.ts`.

### Decorate slot

`decorate()` goes through the injection slot: `src/nodes/card-decorate-slot.ts` (react-free) owns `registerCardDecorate`
/ `decorateCardNode`; `assemble-card-node.ts` delegates to it; the adapter is `src/nodes/decorate-card.tsx`, keeping
headless React-free. `registerCardDecorateAdapter()` is idempotent: the barrel and the comment composer each call it at
module top level, and whichever entry loads first in a document installs the adapter.

### Editor surfaces

- Node sets derive from `EDITOR_BASE_NODES`; plugins are two data lists (`CORE_PLUGINS` with `when` conditions,
  `DEFAULT_FEATURE_PLUGINS`), snapshot-pinned by `tests/unit/plugins/derived-feature-plugin-sets.test.ts`.
- A custom host surface wraps its top-level tree in exactly one `InklingSurface` inside an `InklingHostComposer` (nested
  card editors share the top-level undo stack and `onChange`).
- `alignment` defaults ON for the article surface; `focusMode` defaults OFF (host owns the toggle); IME composition
  protection is the update-scan seam's composing skip.

### Document model (`src/headless/`)

React-free by construction: Zod storage schemas (`schema.ts` full ARTICLE, `comment-schema.ts` COMMENT + blank/submit
gates), `node-whitelist.ts`, `dialect.ts` (compact↔full parity), `sanitize-url.ts` (the stored-model link/media URL
scheme policy), the save-pipeline readers (`walk`, `collect`, `toc`, `artifacts`, `equivalence`), and `cards/`
(host-card specs + render helpers, incl. `musicPlayerFallbackHtml`). The server's save/projection pipeline CONSUMES this
model; the feed downgrade + defensive host-card substitution live server-side
(`packages/server/src/infra/lexical/projection-state.ts`) and import back into `/headless` — never the reverse.

### Comment surface (`src/comment/`, the `@kobato/inkling/comment/*` entry)

- The composer beside `headless/comment-schema.ts`: `CommentBodyEditor` wraps `InklingHostComposer` + `InklingSurface`
  with the trimmed node set (`editor/comment-editor-nodes`), the markdown transformers filtered to that node set
  (`editor/comment-markdown-transformers`), the legacy-math downgrade (`editor/comment-legacy-math`, applied to the
  seed), `isEmojiEnabled={false}`, `codeEditor="plain"`, no snippets, no drag. `COMMENT_EDITOR_NODES` stays free of
  `math` / `math-inline` (`apps/kobato/tests/arch/lexical-node-whitelist.test.ts`). The module registers the decorate
  adapter at its top level, so the surface renders its code blocks without the barrel
  (`tests/unit/comment/CommentBodyEditor.cards.test.tsx`).
- Locale and dark mode arrive through `InklingHostComposer` (as the host cards do); labels arrive as the `labels` prop
  or through `loadInklingLabels` — never from route data. `CommentBodyEditor` is reached only through
  `LazyCommentBodyEditor` (placeholder, hover prefetch, `eager` / `focusOnMount`, the iOS zoom lock around the focus
  handoff, an optional host `labels` table that spares the chunk and wins over a table the chunk loaded).
  `warmCommentEditorChunks(locale)` is the hover prefetch hosts call from an action row.
- `CommentContentHtml` renders the stored `content` HTML through `@kobato/sanitize`'s `'comment'` preset (the one reason
  Inkling depends on `sanitize`); `comment-body-helpers` is the plain-text reader (`commentBodyPlainText`).
- `viewport-zoom-lock.ts` is the refcounted iOS viewport lock (`acquireViewportZoomLock` / `releaseViewportZoomLock` /
  `isIosWebKit`) both apps' `useIosNoZoomOnFocus` hooks and the composer hold.
- The surface imports Inkling internals through the private alias, never the barrel, so the island stays a lazy chunk.

### Host cards (`src/host-cards/`)

- The kobato assemblies: `music-player.tsx`, `solution.tsx`, `two-column.tsx` (entry-local base classes via
  `generateDecoratorNode` — a DISTINCT class per dist entry), `kobato-image-node.tsx`, `menu-matches.ts`, and the
  load-bearing `index.ts` (registers every card at module scope). Card chrome i18n reads `admin.editor.cards.*` through
  `@kobato/ui`'s `useI18n()`.
- The music card ships WITHOUT a picker — the dialog is host data flow; the admin editor registers it via
  `registerCardPicker(MUSIC_PLAYER_NODE_TYPE, ...)` in `apps/kobato/src/ui/editor/music-card-picker.tsx`.
- `defineCard` (`src/nodes/cards/host-cards.ts`) validates, assembles, registers, and stores the raw spec
  (`host-card-registry.ts`). Type preservation: `CardSpecFieldMap`/`CardSpecAccessorMap`; base classes interface-merge
  (no hand-written `declare __*`).
- `getHostCardNodes()` returns every registered class in registration order — hosts spread it into
  `<InklingComposer nodes>`. Labels: host entries use `labelKey` `host.<name>`, resolved as `menu.host.<name>.label`/
  `.desc` through `<InklingComposer labels>`; spec text is the fallback.

### Pick seam

- Host cards referencing host-owned entities declare `picker: { render, autoOpenOnInsert? }` — host code. Dispatch rides
  the per-composer store (`card-picker-store.ts`): `useCardPicker().open(nodeKey)` or INSERT_CARD_COMMAND's `openPicker`
  flag; `registerCardCommands` is the single write site. Command channel only; `open()` no-ops when not editable. One
  picker per node type, enforced both ways; `registerCardPicker` REJECTS `autoOpenOnInsert`. Requests cross by node KEY,
  never instance; `fromInsert` merges the pick into the insert's history entry (`HISTORY_MERGE_TAG`). The registry field
  is type-only React, so headless stays free of the seam.

### Node families

- Node-coupled modules sit with consumers, not in `utils/`. No `utils/` module may runtime-import `nodes/` (except pure
  leaves under `nodes/base/utils/`), `components`, `hooks`, or `plugins`
  (`tests/unit/utils/utils-import-guard.test.ts`).
- Table family (`src/nodes/table/`): `INKLING_TABLE_NODES` joins `EDITOR_BASE_NODES` after the link pair; header policy
  single-sourced in `table-facts.ts`; the cell guard allows one paragraph of inline content per cell.
- Footnote pair: `FootnoteRefNode`'s visible text IS the 1-based citation index; `footnote-anchors.ts` owns the
  `user-content-fn(N)`/`user-content-fnref(N)` contract; `$syncFootnoteIndices` (first-citation order) + the RootNode
  transform keep definitions one doc-end run; nested editors never get footnotes.
- Artifact slots stay opaque: `highlightedHtml` (Shiki) and `mathml`/`svg` (KaTeX) are host-filled on save (never in the
  browser, CSP); the `code`/`language`/`tex` setters clear the slot on edit.

### Labels and word counting

- `src/labels/inkling-labels.ts` owns the closed flat table; `<InklingComposer labels>` merges a host override subset
  once; `DEFAULT_LABELS` and its types export from `src/shared-exports.ts`. The kobato overlay tables arrive per locale
  through `loadInklingLabels` (see "Editor platform").
- Word count: `language` drives `Intl.Segmenter`; state lives in a per-TOP-LEVEL-editor `WordCountState` WeakMap keyed
  by COUNTER INSTANCE identity — never globals; dedup is PER CALLBACK.
- Backtick chord: an unmodified backtick over a non-collapsed range dispatches `FORMAT_TEXT_COMMAND 'code'` (one undo
  entry); collapsed, modifiers, Shift, and IME fall through.

## Documented tradeoffs

- Content typography is host-owned (`typeset typeset-post|typeset-comment`); `src/styles/components/inkling-prose.css`
  keeps only card rhythm, nested-editor chrome variants, and the accent re-scope.
- `src/styles/index.css` is the package's complete Tailwind entry; consumers never add Inkling paths to their `@source`.
  The one sanctioned surface scan of Inkling code is `src/styles/cards.css` — Inkling's own product-token partial,
  composed by every surface entry: it scans the host cards and `src/comment`, whose product-token chrome (`border-line`,
  `border-brand`, `ring-brand/40`) has no theme token in Inkling's own compile. `src/styles/comment-editor.css` is the
  comment canvas host rules (no zoom), imported by `CommentBodyEditor`; the page canvas twin is the workspace's
  `apps/kobato/src/ui/styles/inkling-editor.css`.
- Chrome arbitrary values are authored in rem, never px (canvas runs `zoom: 2/3` on a 15px root); web's host adapters
  bridge tokens (`--inkling-accent-color` ← `--brand`).
- `@kobato/inkling/headless` is the server bundle's ONLY editor import; the barrel's shared contract is single-sourced
  in `src/shared-exports.ts` — add shared names there, never in the barrel. Headless bypasses `shared-exports`; the
  barrel never re-exports headless conversion modules (jsdom stays out of the client graph). `version` reads
  `__APP_VERSION__`.
- Lazy runtimes keep the island chunk free of them: emoji-picker-react (datasets ride lazy chunks via
  `src/plugins/behaviour/emoji-datasets.ts`), markdown-it, CodeMirror, yjs/y-websocket (`fast-average-color` stays
  eager).
- Base node classes never reuse DOM global names (`Base*Node`). React Compiler runs on the layer.
- The headless HTML API lazily imports jsdom only behind `src/html/headless-dom.ts`; `lexicalStateToHtml` owns the
  render recipe. No second jsdom importer.

## Testing

Own vitest project (`inkling-unit`, jsdom, globals off, vmThreads), built by the `inklingUnitProject` factory
(`@kobato/test/projects/inkling-unit.ts`) and instantiated from `tests/vitest.config.ts`; the factory inlines
`@testing-library/jest-dom` (`server.deps.inline`) — keep that inline entry. Rendered-card specs need the decorate
adapter (`tests/utils/test-editor.ts`); an unregistered slot throws on first card render. See `tests/AGENTS.md`.
