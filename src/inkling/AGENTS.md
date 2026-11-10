# AGENTS.md — Inkling editor layer

## Overview

- `src/inkling/` is kobato's rich-text editor layer (Lexical 0.53, React 19, TS), importing nothing from other layers. Source `src/inkling/`; tests
  `tests/inkling/` (own vitest project); demo `demo/`.
- Two entry surfaces only (`tests/unit/shared/contracts/boundaries.test.ts`): `@/inkling` (React barrel `src/inkling/index.ts`; for `client/`, `ui/`,
  `routes/`) and `@/inkling/headless` (`src/inkling/headless.ts`, react-free; the only surface `server/` and `shared/` may use). The barrel's top-level
  `registerCardDecorateAdapter()` call MUST stay explicit.
- Composer: the Lexical EXTENSION API, not `LexicalComposer`. `InklingComposerBase` (also the card-free composer) mounts `LexicalExtensionComposer` with the
  root extension from `src/inkling/components/inkling-root-extension.ts` (namespace/theme/html/nodes/onError plus `$initialEditorState`: `null` when
  collaboration bootstraps; initializers keep the `root.isEmpty()` guard).
- Freeze the extension per mount via a lazy `useState` initializer: `LexicalExtensionComposer` REBUILDS the editor when the extension identity changes.
  `contentEditable={null}` on the composer: the `RichTextPlugin` core entry owns the editable element. Decorators render through `ReactExtension`, so the
  root extension wires its `ErrorBoundary` to `InklingErrorBoundary` (the `RichTextPlugin` prop is inert).
- Composer-owned Providers wrap `LexicalExtensionComposer` itself: ReactExtension renders card decorators as siblings of `children`, so Providers under
  `children` are invisible to cards and their nested editors.

## Essential commands

Run from the kobato root:

```bash
pnpm run type        # root tsc — one pass, also covers tests/inkling
pnpm run lint        # oxlint (root config)
pnpm test:inkling    # vitest run --project inkling (<file> for one file; npx vitest --project inkling = watch)
pnpm run fmt         # oxfmt --write (covers src/inkling, tests/inkling, demo)
pnpm run fmt:check   # oxfmt --check
pnpm demo            # vite demo — not part of the type/test/build gates
```

## Code style

- `oxfmt` / `oxlint` are configured ONLY at the kobato root (`oxfmt.config.ts`, `oxlint.config.ts`); this layer has no config files. The root oxlint config
  scopes inkling exceptions in a `src/inkling/**` override (public barrel, intentional Lexical cycles, class+interface merging, editor-chrome a11y
  exemptions, keeper rules — eqeqeq / no-eval / no-plusplus / no-explicit-any); the root oxfmt config points Tailwind sorting at
  `src/inkling/styles/index.css` with `clsx` via its `src/inkling/**`, `demo/**` override.
- Single quotes, no semicolons, trailing commas, print width 120; Tailwind scoped under `.inkling-lexical`; import sorting by `oxfmt`. `oxlint` is
  type-aware (oxlint-tsgolint, TS7-based, `typeCheck` on) against the single root `tsconfig.json`, `tests/inkling` included; `verbatimModuleSyntax` makes
  `import type` mandatory. A tsconfig edit that floods test files with `TS2339`-style errors means tsgolint's cached program is stale — re-run
  `pnpm run lint` once.

## Architecture notes

Glossary owned here: **card** (a decorator-node block), **card adjacency**, **card spec**, **card declaration**, **render target**, **host card**,
**artifact slot**, **render-time meta**.

### Card pipeline

- Cards collapse to declarations (`src/inkling/nodes/cards/*.declaration.ts`); memoized `assembleCardNodeOnce` (`src/inkling/nodes/assemble-card-node.ts`)
  assembles the class once per card, and `CARD_WRAPPER_NODES` (`src/inkling/nodes/cards/card-wrappers.ts`) derives from `CARD_DECLARATIONS`.
- `src/inkling/nodes/*Node.ts` are type-only shims exposing the assembled class, the base-canonical `$is*`, and the dataset type. Never import
  `@/inkling/index` from a shim; import `@/inkling/components/InklingCardWrapper` and `@/inkling/nodes/MinimalNodes` directly. Base classes are `Base*Node`
  with `$createBase*Node`; the public `*Node` / `$create*Node` live in the shim and construct the assembled class.
- Behaviour sits on the declaration (menu/insert/markdown) or the base class (e.g. `isEmpty`); nested-editor/transient specs are adopted via class statics
  only (no `nestedEditors` generator option). A declaration carries menu entries (commands as `CardMenuCommand` strings, never the command table), insert
  flags, drag icon, and markdown eligibility (`CardMarkdownSpec`: `{ kind: 'fence' }` | `{ kind: 'exempt' }`).
- Derived views (through `resolveCardFacts` in `src/inkling/nodes/cards/card-facts.ts`: built-in first, host fallback):
  `src/inkling/nodes/cards/card-commands.ts` (exhaustive by node type, via `resolveCardInsertCommand` / `resolveCardMenuCommand`), menu and drag-icon
  registries, decorate targets (`render*Card` in `src/inkling/nodes/*NodeComponent.tsx`, paired by `src/inkling/nodes/cards/card-decorate.tsx`), and the
  fence payload table (`src/inkling/nodes/cards/card-markdown-transformers.ts`, exhaustive by fence-eligible declarations).
- Spec arrays live in the base node module (`as const satisfies`); `CardSpecFieldMap` derives the shim's `__*` names and value types (transient `initial`
  lambdas carry the value type; `nullable: true` carries `LexicalEditor | null`), and the base class self-types the same vocabulary via
  `CardSpecFieldMapFor` — renaming or retyping an entry is a compile error.
- Adding a card = a declaration plus the touch points in `src/inkling/nodes/cards/index.ts` (render export, command constant, labels keys, fence payload).
  Pins: `tests/inkling/unit/nodes/card-cross-registry-consistency.test.ts`, `tests/inkling/unit/nodes/card-declarations.test.ts`,
  `tests/inkling/unit/nodes/card-layering-imports.test.ts`.

### Menu dataset typing

- `CardDeclaration` takes base class and spec array types
  (`CardDeclaration<'image', typeof BaseImageNode, typeof imageTransientProps, typeof imageNestedEditors>`, `readonly []` when absent); `CardMenuDataset`
  derives `insertParams`' partial dataset and `queryParams`' string-valued keys from `getPropertyDefaults()` plus `CardSpecTransientDataset` /
  `CardSpecNestedEditorDataset`, so bad keys or values are compile errors. Omitting them is NOT a fallback (`DeclaredCardMenuDataset` → `never`);
  `AnyCardDeclaration` is the broad existential.
- `checkedCardDeclaration({ … } satisfies CardDeclaration<…>)`: `satisfies` keeps contextual typing and shape checking; the identity wrapper
  exact-key-checks the inferred menu literal, including function-valued `insertParams` returns. `tests/inkling/typecheck/card-menu-params.ts` pins rejection
  (both forms), the non-vacuous probes, and that every `CARD_DECLARATIONS` insert/query key belongs to its dataset.
- Host `defineCard` derives the same vocabulary from `B` plus `Transient`/`Nested` and rejects unknown `insertParams` keys, drifted values, and non-string
  query keys on a DIRECT INLINE literal. Pre-widened input (`queryParams: readonly string[]`, `baseNode: CardBaseNodeClass` via variable, return, or
  annotation) is a type-erasure boundary and goes unchecked; `satisfies HostCardSpec` keeps `insertParams` checked but widens `queryParams` to `string`;
  `const spec: HostCardSpec = …` erases all keys.

### Decorate slot

- `decorate()` goes through an injection slot: `src/inkling/nodes/card-decorate-slot.ts` (react-free) owns `registerCardDecorate(impl)` /
  `decorateCardNode(node)`, and `src/inkling/nodes/assemble-card-node.ts` delegates to it. The adapter is `src/inkling/nodes/decorate-card.tsx` (every card
  component, CodeMirror included), keeping `@/inkling/headless` react-free.

### Editor surfaces

- Node sets derive from `EDITOR_BASE_NODES` (`src/inkling/nodes/DefaultNodes.ts`); plugins are two data lists — `CORE_PLUGINS`
  (`src/inkling/plugins/CorePlugins.tsx`: the mount set every `InklingComposableEditor` renders, entries with `when` conditions and a typed
  `CorePluginScope`) and `DEFAULT_FEATURE_PLUGINS` (`src/inkling/plugins/DefaultFeaturePlugins.tsx`) — snapshot-pinned by
  `tests/inkling/unit/plugins/derived-feature-plugin-sets.test.ts`.
- A custom host surface wraps its top-level tree in exactly one `InklingSurface` inside an `InklingComposer`, so nested card editors share the top-level
  undo stack and `onChange`.
- `alignment` (default ON for the InklingEditor article surface; `src/inkling/plugins/behaviour/format-toolbar.ts`) keeps element `format` and exposes
  left/center/right on paragraph/heading/quote. `focusMode` (default OFF; host owns the toggle) mounts the `focus-mode` core entry (`FocusModePlugin`),
  whose `src/inkling/plugins/behaviour/focus-mode.ts` sets `inkling-focus-mode` on the root and `data-inkling-focus-active` on the selected top-level block
  via a DOM walk.
- `InklingAutoLinkPlugin` (`src/inkling/plugins/behaviour/autolink.ts`) no-ops without AutoLinkNode; `TypographyPlugin`
  (`src/inkling/plugins/behaviour/typography.ts`) matches tiptap extension-typography minus the em-dash rule `EmEnDashPlugin` owns. IME composition
  protection is the update-scan seam's composing skip.

### Host cards

- `defineCard` (`src/inkling/nodes/cards/host-cards.ts`) takes one spec: base node (exported `generateDecoratorNode`), insert/menu/toolbar facts, decorate
  render. It validates, assembles, registers, and stores the raw spec in `src/inkling/nodes/cards/host-card-registry.ts` (registry-only), projected through
  the built-in projectors and intersected with each editor's registered node types.
- Type preservation: generics over `Spec`, `Transient`/`Nested`, and the menu literal `Menu`; the returned
  `HostCard<NodeType, Spec & { transientProps?; nestedEditors? }>` keeps const-asserted arrays' literal `__*` names and value types on `card.node` via
  `CardSpecFieldMap`/`CardSpecAccessorMap`, while a non-const inline array widens names to `string`. Base classes interface-merge `CardSpecFieldMapFor` (no
  hand-written `declare __*`). Pins: `tests/inkling/unit/nodes/host-cards.test.ts`.
- Markdown: `src/inkling/markdown/round-trip.ts` composes every registered host card by default; a `markdownFence` transformer derives from the stored spec
  via `createCardTransformer`. The `cards` option AUGMENTS the default (handles without `defineCard`) and replaces a nodeType collision; no opt-out flag —
  leave a card out by not declaring `markdownFence`.
- Node set: `getHostCardNodes()` (barrel-exported, `src/inkling/nodes/cards/host-card-nodes.ts`) returns every registered host card's class in registration
  order, so hosts spread it into `<InklingComposer nodes>`; card modules' imports carry the `defineCard` side effects.
- Labels: host entries use `labelKey` `host.<name>`, resolved as `menu.host.<name>.label`/`.desc` through `<InklingComposer labels={...}>`
  (`InklingLabelsInput` opens exactly that template; the shipped `InklingLabels` table and snapshot stay closed; `lookupLabel` reads host keys through its
  `in` guard). Spec text is the fallback.

### Pick seam

- Host cards referencing host-owned entities declare `picker: { render, autoOpenOnInsert? }`; the dialog is host code. Dispatch rides a per-composer handle
  (`src/inkling/plugins/behaviour/cardPickerStore.ts`, created in `ComposerHandlesProvider`, context `src/inkling/context/CardPickerStoreContext.tsx`):
  `useCardPicker().open(nodeKey)`, or INSERT_CARD_COMMAND's `openPicker` flag (insert registrar when `autoOpenOnInsert` is projected, or a host intent
  command), with `registerCardCommands` as the single write site. Command channel only; `open()` no-ops when not editable.
- `CardPickerHostPlugin` (a `CORE_PLUGINS` entry gated to non-nested, non-read-only surfaces) resolves via `resolveCardPicker` (spec `picker` first, then
  variant override) and mounts `picker.render({ editor, nodeKey, close, fromInsert })`. `registerCardPicker(nodeType, picker)` overrides a type with no host
  spec (a same-type subclass of a built-in card, which `defineCard` rejects): one picker per node type, enforced both ways, and it REJECTS
  `autoOpenOnInsert` — such inserts ride the built-in registration, so the host passes `openPicker: true` itself.
- Lifecycle (`tests/inkling/unit/plugins/card-picker.test.tsx`): the request drops when the node leaves the document, when the picker unregisters, and on
  host unmount.
- Requests cross by node KEY, never the instance (Lexical #195); writes resolve the latest instance in `editor.update()` through `useCardChrome`.
  `fromInsert` (only at the `openPicker` site) merges the pick into the insert's history entry via `mergeHistory` (`HISTORY_MERGE_TAG`) — one Cmd+Z retracts
  both; placeholder/replace stays discrete.
- The registry field is type-only React, so headless stays free of the seam. The barrel re-exports `COMMAND_PRIORITY_*` (name the level, never the number)
  and `createRenderContext` (exportDOM overrides call `renderFn(this, createRenderContext(options))`; react-free, but kept off `@/inkling/headless`).

### Node families

- Each card's renderer lives under `src/inkling/nodes/base/nodes/<card>/` with its spec arrays; the caption spec core is
  `src/inkling/nodes/base/nodes/caption-editor-spec.ts`, whose MINIMAL_NODES import composes only base leaves.
- `src/inkling/utils` is the bottom layer; node-coupled modules sit with consumers: `src/inkling/nodes/upload-intent.ts`,
  `src/inkling/nodes/cards/card-menu-build.ts`, `src/inkling/nodes/cards/editor-card-nodes.ts`, `src/inkling/nodes/nested-editors.ts`,
  `src/inkling/nodes/base/utils/image-card-widths.ts`, `src/inkling/hooks/bookmark-embed-flow.ts`. No utils module may runtime-import `@/inkling/nodes`
  (except pure leaves under `@/inkling/nodes/base/utils/`), `@/inkling/components`, `@/inkling/hooks`, or `@/inkling/plugins`
  (`tests/inkling/unit/utils/utils-import-guard.test.ts`); `CARD_WIDTHS` exports only via `src/inkling/utils/index.ts`, and internal consumers import
  `@/inkling/nodes/base/utils/card-widths`.
- Table family (`src/inkling/nodes/table/`): `INKLING_TABLE_NODES` re-exports upstream `TableNode`/`TableRowNode`/`TableCellNode` and joins
  `EDITOR_BASE_NODES` after the link pair (LinkNode + AutoLinkNode; AutoLinkNode extends LinkNode, so imported `<a>` stays LinkNode, and
  `DEFAULT_HTML_NODES` registers it since typed-URL autolinks serialize as `autolink`). Its slash/plus entry is a pseudo `CardMenuSource` (`table-menu.ts`)
  merged by `useCardMenu` only when TableNode is registered.
- `INSERT_TABLE_COMMAND` is our `src/inkling/plugins/behaviour/table.ts` command (3×3, header row only, never a header column), not upstream's
  `registerTablePlugin`; it plus upstream's selection observer form `InklingTablePlugin` in `DEFAULT_FEATURE_PLUGINS`.
- Cell guard: `table-cell-guard.ts` allows one paragraph of inline content per cell (math-inline dropped, footnote-ref illegal when present) as a default
  transform, covering the headless import path. The family is absent from `DEFAULT_BASE_NODES`; `DEFAULT_HTML_NODES` appends it after the base run, so the
  headless HTML API renders tables.
- Header policy is single-sourced in `src/inkling/nodes/table/table-facts.ts`: HTML export maps header cells to `<th>`
  (`src/inkling/html/renderer/transformers/element/table.ts`); the GFM pipe-table transformer in `src/inkling/markdown/round-trip.ts` forges row 0 as the
  header (`@lexical/markdown` 0.53 has no TABLE transformer).
- Footnote pair: `FootnoteRefNode` (`src/inkling/nodes/footnote/FootnoteRefNode.ts`) is a TextNode entity (`isTextEntity()` + `canInsertText*`) whose
  visible text IS the 1-based citation index (renumber rewrites it in place); `footnote-anchors.ts` owns the `user-content-fn(N)`/`user-content-fnref(N)`
  contract, `footnote-keys.ts` recasts imported refs' `targetKey`. The definition is a menu-less declaration-pipeline card with one nested editor for
  `content`.
- Footnote behaviour (`src/inkling/plugins/behaviour/footnotes.ts`): `^ ` trigger `FOOTNOTE_INSERT_TRIGGER_REGEX = /(\s|^)\^ $/` (backslash suppression,
  table-cell/code-block guard), `$syncFootnoteIndices` (first-citation order, orphans tailed in stored order, sync skipped when a ref targets a missing
  definition, signature short-circuit), `$removeFootnote` (definition plus citing refs; a ref-less definition stays an orphan), and a RootNode transform
  keeping definitions one doc-end run. `FootnotePlugin` (key `footnote`) is the React/DOM adapter only.
- Footnote export wraps the run in a `<section>` via `src/inkling/nodes/footnote/footnote-html-export.ts` on `src/inkling/html/renderer/post-process.ts`
  (title via `resolveExportPolicy('footnotes-section-title')`, deprecated `footnotesSectionTitle` consulted, blank → "Footnotes"); refs splice through
  `isInlineMarkupEntity()`. Known gap: nested editors are separate instances, so insertion is disabled there and numbering never descends.
- Artifact slots stay opaque: `highlightedHtml` (Shiki) and `mathml`/`svg` (KaTeX) are host-filled on save (never in the browser, CSP); the
  `code`/`language`/`tex` setters clear the slot on edit, while construction and `importJSON` assign private fields so host-filled artifacts survive
  deserialization; `invalidates` references are validated against the declared property vocabulary at class creation. Render-time meta rides
  `ExportDOMOptions.resolveRenderMeta` into the frozen render context, resolved by (kind, id) synchronously before export.

### Labels and word counting

- `src/inkling/labels/inkling-labels.ts` owns the closed flat table (dotted keys + English defaults); `<InklingComposer labels={...}>` merges a host
  override subset once into `InklingUiPrefsContext.labels`; components use `useInklingLabels()`. `DEFAULT_LABELS` and its two types export from `@/inkling`
  (`src/inkling/shared-exports.ts`); `tests/inkling/unit/labels.test.ts` snapshots the keys.
- ui-prefs flags: `isEmojiEnabled` (default true; `false` keeps `EmojiPickerPlugin` out of `InklingNestedEditor`/`InklingCaptionEditor` only) and
  `codeEditor` (default `'rich'`; `'plain'` uses static `CodeBlockPlainEditor`, no codemirror chunk; pinned by
  `tests/inkling/unit/components/ui/cards/plain-code-editor-import-guard.test.ts`).
- Menu labels: each declaration entry (and the table pseudo-source) carries a required `labelKey`; `buildCardMenu` resolves `menu.${labelKey}.label`/`.desc`
  via `useCardMenu`'s resolver; declared English is the fallback.
- Word count: `language` drives `Intl.Segmenter` (`countWords(text, language)`) and publishes on the handle; `wordCountLanguage` (UI locale) seeds
  `language ?? wordCountLanguage` from `InklingUiPrefsContext`; with both absent it stays `undefined` (published `null`) and `countWords` keeps its regex
  path. Hosts mount the plugin themselves.
- `onSelectionChange?: (count: number | null) => void`: `null` = collapsed/no selection; `0` = non-empty selection with zero words (punctuation-only is `0`,
  never `null`). A rendered editor's DOM root is the focus authority; `focusedEditor` serves rootless headless editors and clears on detach;
  `registerEditableListener` recomputes on `readOnly` flips. `createWordCounter` (`src/inkling/plugins/behaviour/word-counter.ts`) owns both channels; a
  selection-only mount never runs the document pass; no callback attaches no listeners.
- `selectionCounts` lives with `nodeWordCounts` in the per-TOP-LEVEL-editor `WordCountState` WeakMap (never globals), keyed by COUNTER INSTANCE identity;
  entries count only when `entry.editor.isEditable()` and `hasEditorFocus(entry.editor, state)`; newest eligible wins; a collapsed selection emits null, not
  another editor's stale count.
- Dedup is PER CALLBACK (`lastSelectionWordCounts: Map<callback, number | null>`); attaching emits only without a prior entry; detach broadcasts once to the
  departing callback, then prunes entries no remaining counter owns. Document and selection are independent counters (`setLanguage` swaps in place on both),
  publishing through one `publishWordCountCallback` effect with per-channel ownership stacks (null language = "no opinion").
- `InklingNestedComposer` mounts a nested `WordCountPlugin` when EITHER callback is present; `useWordCountSelectionCallback` is the render-only selection
  subscription. Pins: `tests/inkling/unit/plugins/behaviour/word-counter.test.ts`, `tests/inkling/unit/plugins/behaviour/wordCountHandle.test.ts`,
  `tests/inkling/unit/plugins/WordCountPlugin.test.tsx`, `tests/inkling/unit/components/InklingNestedComposerWordCount.test.tsx`.
- Backtick chord in `KEYBOARD_SHORTCUTS` (`src/inkling/plugins/behaviour/keyboard-navigation/shortcuts.ts`; type `KeyboardShortcut`; the registration
  function keeps `registerModifierCommand`): unmodified backtick over a non-collapsed range selection dispatches `FORMAT_TEXT_COMMAND 'code'` via
  `dispatchCodeFormat` (the ctrl+shift+K helper) — one undo entry; collapsed selections, alt/ctrl/meta, Shift, and IME fall through. `matches` is a pure
  key-shape test, `run` may return false, the loop stops at the first match; `registerKeyboardNavigation` covers nested editors; CodeMirror owns its own
  backtick. Pinned by `tests/inkling/unit/plugins/behaviour/backtick-code-selection.test.tsx`.

## Documented tradeoffs

- Content typography is NOT owned here: the host owns `src/styles/typeset.css` and passes `contentEditableClassName="typeset typeset-post|typeset-comment"`
  into `InklingComposableEditor`; `src/inkling/styles/components/inkling-prose.css` keeps only card rhythm, nested-editor chrome variants, the aside
  pull-quote, and the accent re-scope. The typeset guard honors `.not-inkling-prose` and `.inkling-blockquote-alt`.
- `src/inkling/styles/index.css` is consumed as source: imported by `src/styles/inkling-editor.css` and `src/styles/inkling-comment-editor.css` into the
  `inkling` cascade layer, below `utilities` and above `base` via the bare `@layer` statements in `admin.css` / `public.css`. Chrome arbitrary values are
  authored in rem (0.1rem/px), never px: the canvas runs `zoom: 2/3` on a 15px root (demo: 10px-root). Both partials import `src/styles/dark-variant.css`
  first, and bridge tokens (`--inkling-accent-color` ← `--brand`, `--font-sans` ← `--font-body`).
- `src/inkling/markdown/round-trip.ts` intentionally uses a constrained node set and does not round-trip decorator cards.
- `@/inkling/headless` (zero React) is the server-side conversion surface only (HTML/markdown/plain-text converters) and the server bundle's ONLY editor
  import, which also takes `generateDecoratorNode` plus `DecoratorNodeProperty` from it. `RenderContext` / `ExportDOMOutput` stay internal (hosts declare
  slices like `CardRenderContext`); the barrel's shared contract is single-sourced in `src/inkling/shared-exports.ts` — add shared names there, never in the
  barrel.
- `@/inkling/headless` bypasses `shared-exports` (it would pull the React tree in), and the barrel never re-exports headless conversion modules:
  `headless-html` reaches jsdom through `headless-dom`'s lazy import, so a re-export would drag jsdom into the client graph
  (`tests/inkling/unit/html/jsdom-import-guard.test.ts`). `version` reads `__APP_VERSION__`.
- Lazy runtimes keep the island chunk free of them: emoji-mart via `src/inkling/plugins/behaviour/emoji-completion.ts` (chunk `emoji-search-index.ts`, first
  ':' query), the callout `EmojiPickerPortal` behind `React.lazy`; markdown-it via `src/inkling/markdown/lazy-paste-dialect.ts` (pre-warmed on mount,
  awaited on cold first paste, seeded by the headless HTML surface); CodeMirror via `src/inkling/components/ui/cards/LazyCardEditor.tsx` (static fallback on
  SSR/first render) in `CodeBlockCard.tsx` and `HtmlCard.tsx`, with `src/inkling/utils/codemirror-config.ts` on the shared chunk; `yjs`/`y-websocket` via
  `enableMultiplayer` and `src/inkling/utils/services/lazy-collaboration.ts`, with `useCollaborationProviderFactory` the React adapter. `fast-average-color`
  stays eager.
- Composition defaults: `InklingComposer`'s `nodes` prop is OPTIONAL (defaults to `DEFAULT_NODES`) while `src/inkling/components/InklingComposerBase.tsx`
  requires it; `MarkdownShortcutPlugin` defaults to the card-free `MINIMAL_TRANSFORMERS` (`InklingEditor` passes `DEFAULT_TRANSFORMERS`).
- Base node classes must not reuse DOM global names — hence `Base*Node` (e.g. `BaseAudioNode`). React Compiler runs on the layer (`@vitejs/plugin-react`'s
  `compiler: true`, also for inkling tests).
- The headless HTML API lazily imports `jsdom` behind `src/inkling/html/headless-dom.ts` — the only module that may import it; `lexicalStateToHtml` owns the
  render recipe, `src/inkling/html/headless-editor.ts` the shared assembly with merge modes (renderer/plain-text `additive` vs importer `wholesale`). Do not
  add a second jsdom importer.

## Testing

- Vitest, jsdom, globals off (explicit `vitest` imports), its own project (`tests/inkling/vitest.config.ts`; include list mirrors the layer: `unit/`,
  `utils/`, `clean-basic-html/`, `html-api/`, `html-to-lexical/`, `html-renderer/`, `markdown/`, `transforms/`, `nodes-base/`). Part of root
  `pnpm run test`; `src/inkling/**` is excluded from the root coverage gate.
- `vitest.config.ts` inlines `@testing-library/jest-dom` (`server.deps.inline`); externalizing it splits the snapshot/expect singletons and breaks every
  `toMatchSnapshot`. Keep that inline entry.
- Rendered-card specs need the decorate adapter: `tests/inkling/utils/test-editor.ts` registers it, bespoke `createEditor` specs call
  `registerCardDecorateAdapter()` at module scope, and an unregistered slot throws on first card render.

## Before finishing work

1. Run `pnpm run type`, `pnpm run lint`, and `pnpm test:inkling`.
2. Run `pnpm run fmt` if you changed imports.
3. Do not commit secrets or external fixture URLs for removed integrations.
