# Inkling editor layer

## Overview

- `packages/inkling/src/` is kobato's rich-text editor (Lexical 0.53, React 19). It owns the stored document model
  (`src/headless/`, React-free) and the kobato host cards (`src/host-cards/`). It imports only `@kobato/ui`,
  `@kobato/sanitize`, `@kobato/assets`, `@kobato/utils` — never contracts, server, db, or web.
- Three public entry surfaces (`apps/kobato/tests/arch/package-dag.test.ts`): `@kobato/inkling` (React barrel
  `src/index.ts`), `@kobato/inkling/headless` + per-file imports (`src/headless/`, React-free — the only editor surface
  `server`/`db`/`contracts`/`catalog` may use), and `@kobato/inkling/host-cards` (side-effect registration + image
  node + music base class). The barrel's top-level `registerCardDecorateAdapter()` call MUST stay explicit; the barrel
  never re-exports host-cards.
- Composer: the Lexical EXTENSION API, not `LexicalComposer`. `InklingComposerBase` mounts `LexicalExtensionComposer`
  with the root extension from `src/components/inkling-root-extension.ts`; `contentEditable={null}` (RichTextPlugin owns
  the editable); decorators render through `ReactExtension`, so the root extension wires the `ErrorBoundary`.
  Composer-owned Providers wrap the composer itself — Providers under `children` are invisible to cards and nested
  editors. Freeze the extension per mount via a lazy `useState` initializer.

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
- `src/index.ts` exports the editor's full API, not today's consumer subset — "unused in kobato" is not dead surface,
  and pruning would churn the public API. Extend it only with deliberately-public API.

## Architecture

Glossary owned here: **card**, **card adjacency**, **card spec**, **card declaration**, **render target**, **host
card**, **artifact slot**, **render-time meta**.

### Internal layer order

`nodes/` is the model core; `components/` renders it, `plugins/` + `transforms/` mutate it, `context/` carries state,
`hooks/` is React glue, `services/` the machines, `html/` + `markdown/` the serialization planes, `headless/` the
React-free model, `host-cards/` the kobato assemblies. `headless/` is the one hard floor: React-free at the
runtime-closure level (`tests/unit/headless/headless-boundary.test.ts`).

### Card pipeline

- Cards collapse to declarations (`src/nodes/cards/*.declaration.ts`); `assembleCardNodeOnce` assembles the class once
  per card; `CARD_WRAPPER_NODES` derives from `CARD_DECLARATIONS`.
- `src/nodes/*Node.ts` are type-only shims (assembled class, `$is*`, dataset type). Behaviour sits on the declaration
  (menu/insert/markdown) or the base class; nested-editor/transient specs adopt via class statics.
- Derived views go through `resolveCardFacts` (`src/nodes/cards/card-facts.ts`, built-in first, host fallback):
  `card-commands.ts` (exhaustive by node type), menu/drag-icon registries, decorate targets, and the fence payload
  table.
- Spec arrays live in the base node module (`as const satisfies`); `CardSpecFieldMap` derives the shim's `__*` names —
  renaming or retyping an entry is a compile error.
- Adding a card = a declaration plus the touch points in `src/nodes/cards/index.ts` (render export, command constant,
  labels keys, fence payload). Pins:
  `tests/unit/nodes/card-{cross-registry-consistency,declarations,layering-imports}.test.ts`.
- Menu dataset typing: `CardDeclaration<...>` (`readonly []` when absent); `checkedCardDeclaration` keeps contextual
  typing and exact-key-checks (`tests/typecheck/card-menu-params.ts`). Host `defineCard` derives the same vocabulary;
  pre-widened input (variable/return/annotation) is a type-erasure boundary and goes unchecked.

### Decorate slot

`decorate()` goes through the injection slot: `src/nodes/card-decorate-slot.ts` (react-free) owns `registerCardDecorate`
/ `decorateCardNode`; `assemble-card-node.ts` delegates to it; the adapter is `src/nodes/decorate-card.tsx`, keeping
headless React-free.

### Editor surfaces

- Node sets derive from `EDITOR_BASE_NODES`; plugins are two data lists (`CORE_PLUGINS` with `when` conditions,
  `DEFAULT_FEATURE_PLUGINS`), snapshot-pinned by `tests/unit/plugins/derived-feature-plugin-sets.test.ts`.
- A custom host surface wraps its top-level tree in exactly one `InklingSurface` inside an `InklingComposer` (nested
  card editors share the top-level undo stack and `onChange`).
- `alignment` defaults ON for the article surface; `focusMode` defaults OFF (host owns the toggle); IME composition
  protection is the update-scan seam's composing skip.

### Document model (`src/headless/`)

React-free by construction: Zod storage schemas (`schema.ts` full ARTICLE, `comment-schema.ts` COMMENT + blank/submit
gates), `node-whitelist.ts`, `dialect.ts` (compact↔full parity), the save-pipeline readers (`walk`, `collect`, `toc`,
`artifacts`, `equivalence`), and `cards/` (host-card specs + render helpers, incl. `musicPlayerFallbackHtml`).
`styles/cards.css` is the app-surface Tailwind partial. The server's save/projection pipeline CONSUMES this model; the
feed downgrade + defensive host-card substitution live server-side
(`packages/server/src/infra/lexical/projection-state.ts`) and import back into `/headless` — never the reverse.

### Host cards (`src/host-cards/`)

- The kobato assemblies: `music-player.tsx`, `solution.tsx`, `two-column.tsx` (entry-local base classes via
  `generateDecoratorNode` — a DISTINCT class per dist entry), `kobato-image-node.tsx`, `menu-matches.ts`, and the
  load-bearing `index.ts` (registers every card at module scope). Card chrome i18n reads `admin.editor.cards.*` through
  `@kobato/ui`'s `useI18n()`.
- The music card ships WITHOUT a picker — the dialog is host data flow; web-admin registers it via
  `registerCardPicker(MUSIC_PLAYER_NODE_TYPE, ...)` in `packages/web/admin/src/ui/editor/music-card-picker.tsx`.
- `defineCard` (`src/nodes/cards/host-cards.ts`) validates, assembles, registers, and stores the raw spec
  (`host-card-registry.ts`), projected through the built-in projectors (`tests/unit/nodes/host-cards.test.ts`). Type
  preservation: `CardSpecFieldMap`/`CardSpecAccessorMap`; base classes interface-merge (no hand-written `declare __*`).
- Markdown: `src/markdown/round-trip.ts` composes every registered host card by default; the `cards` option AUGMENTS and
  replaces on nodeType collision.
- `getHostCardNodes()` returns every registered class in registration order — hosts spread it into
  `<InklingComposer nodes>`. Labels: host entries use `labelKey` `host.<name>`, resolved as
  `menu.host.<name>.label`/`.desc` through `<InklingComposer labels>`; spec text is the fallback.

### Pick seam

- Host cards referencing host-owned entities declare `picker: { render, autoOpenOnInsert? }` — host code. Dispatch rides
  the per-composer store (`card-picker-store.ts`): `useCardPicker().open(nodeKey)` or INSERT_CARD_COMMAND's `openPicker`
  flag; `registerCardCommands` is the single write site. Command channel only; `open()` no-ops when not editable. One
  picker per node type, enforced both ways; `registerCardPicker` REJECTS `autoOpenOnInsert`.
- `CardPickerHostPlugin` (CORE_PLUGINS, gated to non-nested non-read-only surfaces) mounts `picker.render(...)`.
  Requests cross by node KEY, never instance; `fromInsert` merges the pick into the insert's history entry
  (`HISTORY_MERGE_TAG`) (`tests/unit/plugins/card-picker.test.tsx`). The registry field is type-only React, so headless
  stays free of the seam. The barrel re-exports `COMMAND_PRIORITY_*` (name the level, never the number) and
  `createRenderContext`.

### Node families

- Node-coupled modules sit with consumers, not in `utils/`. No `utils/` module may runtime-import `nodes/` (except pure
  leaves under `nodes/base/utils/`), `components`, `hooks`, or `plugins`
  (`tests/unit/utils/utils-import-guard.test.ts`).
- Table family (`src/nodes/table/`): `INKLING_TABLE_NODES` joins `EDITOR_BASE_NODES` after the link pair;
  `INSERT_TABLE_COMMAND` is `plugins/behaviour/table.ts` (3×3, header row only, never a header column); header policy
  single-sourced in `table-facts.ts`; the cell guard allows one paragraph of inline content per cell.
- Footnote pair: `FootnoteRefNode`'s visible text IS the 1-based citation index; `footnote-anchors.ts` owns the
  `user-content-fn(N)`/`user-content-fnref(N)` contract; `plugins/behaviour/footnotes.ts` owns triggers,
  `$syncFootnoteIndices` (first-citation order), and the RootNode transform keeping definitions one doc-end run; export
  wraps the run in `<section>`; nested editors never get footnotes.
- Artifact slots stay opaque: `highlightedHtml` (Shiki) and `mathml`/`svg` (KaTeX) are host-filled on save (never in the
  browser, CSP); the `code`/`language`/`tex` setters clear the slot on edit; construction and `importJSON` keep
  host-filled values. Render-time meta rides `ExportDOMOptions.resolveRenderMeta`.

### Labels and word counting

- `src/labels/inkling-labels.ts` owns the closed flat table; `<InklingComposer labels>` merges a host override subset
  once; `DEFAULT_LABELS` and its types export from `src/shared-exports.ts`; `tests/unit/labels.test.ts` snapshots the
  keys.
- ui-prefs flags: `isEmojiEnabled` (default true; `false` keeps EmojiPickerPlugin out of nested/caption editors only)
  and `codeEditor` (default `'rich'`; `'plain'` uses the static CodeBlockPlainEditor, no codemirror chunk).
- Word count: `language` drives `Intl.Segmenter`; state lives in a per-TOP-LEVEL-editor `WordCountState` WeakMap keyed
  by COUNTER INSTANCE identity — never globals; dedup is PER CALLBACK (pins:
  `tests/unit/plugins/behaviour/word-counter.test.ts`, `wordCountHandle.test.ts`,
  `tests/unit/plugins/WordCountPlugin.test.tsx`, `tests/unit/components/InklingNestedComposerWordCount.test.tsx`).
- Backtick chord: an unmodified backtick over a non-collapsed range dispatches `FORMAT_TEXT_COMMAND 'code'` (one undo
  entry); collapsed, modifiers, Shift, and IME fall through
  (`tests/unit/plugins/behaviour/backtick-code-selection.test.tsx`).

## Documented tradeoffs

- Content typography is host-owned (`typeset typeset-post|typeset-comment`); `src/styles/components/inkling-prose.css`
  keeps only card rhythm, nested-editor chrome variants, and the accent re-scope.
- `src/styles/index.css` is the package's complete Tailwind entry; consumers never add Inkling paths to their `@source`.
- Chrome arbitrary values are authored in rem, never px (canvas runs `zoom: 2/3` on a 15px root); web's host adapters
  bridge tokens (`--inkling-accent-color` ← `--brand`).
- `@kobato/inkling/headless` is the server bundle's ONLY editor import; the barrel's shared contract is single-sourced
  in `src/shared-exports.ts` — add shared names there, never in the barrel. Headless bypasses `shared-exports`; the
  barrel never re-exports headless conversion modules (jsdom stays out of the client graph,
  `tests/unit/html/jsdom-import-guard.test.ts`). `version` reads `__APP_VERSION__`.
- Lazy runtimes keep the island chunk free of them: emoji-picker-react (datasets ride lazy chunks via
  `src/plugins/behaviour/emoji-datasets.ts`), markdown-it, CodeMirror, yjs/y-websocket (`fast-average-color` stays
  eager).
- `InklingComposer`'s `nodes` prop is OPTIONAL (defaults `DEFAULT_NODES`) while `InklingComposerBase` requires it;
  `MarkdownShortcutPlugin` defaults to the card-free `MINIMAL_TRANSFORMERS`.
- Base node classes never reuse DOM global names (`Base*Node`). React Compiler runs on the layer.
- The headless HTML API lazily imports jsdom only behind `src/html/headless-dom.ts`; `lexicalStateToHtml` owns the
  render recipe. No second jsdom importer.

## Testing

Own vitest project (`inkling-unit`, jsdom, globals off, `isolate: true`), built by the `inklingUnitProject` factory
(`@kobato/test/projects/inkling-unit.ts`) and instantiated from `tests/vitest.config.ts`; the factory inlines
`@testing-library/jest-dom` (`server.deps.inline`) — keep that inline entry. Rendered-card specs need the decorate
adapter (`tests/utils/test-editor.ts`); an unregistered slot throws on first card render. See `tests/AGENTS.md`.
