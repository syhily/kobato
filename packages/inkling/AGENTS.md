# AGENTS.md — Inkling editor layer

## Overview

- `packages/inkling/src/` is kobato's rich-text editor layer (Lexical 0.53, React 19, TS), importing nothing from other layers. Tests `packages/inkling/tests/` (own vitest project); demo `apps/inkling-demo/`.
- Two public entry surfaces only (`apps/kobato/tests/arch/package-dag.test.ts`): `@kobato/inkling` (React barrel `src/index.ts`; for `client/`, `ui/`, `routes/`) and `@kobato/inkling/headless` (`src/headless.ts`, react-free; the only surface `server/` and `lexical/` may use). The barrel's top-level `registerCardDecorateAdapter()` call MUST stay explicit. Internal source/tests import through the private `@kobato/inkling-internal/...` alias; tests import helpers through `@kobato/inkling/tests/...`.
- Composer: the Lexical EXTENSION API, not `LexicalComposer`. `InklingComposerBase` mounts `LexicalExtensionComposer` with the root extension from `src/components/inkling-root-extension.ts` (namespace/theme/html/nodes/onError plus `$initialEditorState`: `null` when collaboration bootstraps).
- Freeze the extension per mount via a lazy `useState` initializer — the composer REBUILDS the editor when the extension identity changes. `contentEditable={null}` on the composer (`RichTextPlugin` owns the editable element); decorators render through `ReactExtension`, so the root extension wires its `ErrorBoundary` (the plugin prop is inert).
- Composer-owned Providers wrap `LexicalExtensionComposer` itself — ReactExtension renders card decorators as siblings of `children`, so Providers under `children` are invisible to cards and nested editors.

## Essential commands

Run from the kobato root:

```bash
pnpm run type        # root tsc — also covers tests/inkling
pnpm run lint        # oxlint (root config)
pnpm test:inkling    # vitest run --project inkling
pnpm run fmt         # oxfmt --write
pnpm demo            # vite apps/inkling-demo
```

## Code style

- `oxfmt` / `oxlint` are configured ONLY at the kobato root; this layer has no config files. The root oxlint config scopes inkling exceptions in a `packages/inkling/src/**` override; the root oxfmt config scopes Tailwind sorting there too.
- Single quotes, no semicolons, trailing commas, print width 120; Tailwind scoped under `.inkling-lexical`. `oxlint` is type-aware against the single root `tsconfig.json`; `verbatimModuleSyntax` makes `import type` mandatory. A tsconfig edit that floods tests with `TS2339`-style errors means tsgolint's cached program is stale — re-run `pnpm run lint` once.

## Directory and naming rules

One closed public surface (`src/index.ts`) and one react-free surface (`src/headless/index.ts`); internals use `@kobato/inkling-internal/*`. The root bans do not apply verbatim here:

- `hooks/` at the source root is the React-hooks layer (all `use-*`).
- `nodes/base/nodes/<card>/` mirrors the upstream Lexical layout (base class + parser + renderer + declaration); the doubled `nodes/` is intentional.
- `$`-prefixed helpers are Lexical idioms; `.declaration.ts` is the card-declaration suffix; non-component modules are `kebab-case.ts`, components `PascalCase.tsx`.
- Six internal `index.ts` alias seams (`nodes/base`, `nodes/base/nodes/at-link`, `transforms`, `markdown`, `html/html-to-lexical`, `html/clean-basic-html`) are load-bearing module entries, NOT barrels — keep them and import through them.
- `transforms/` is flat (one file per transform); `utils/` holds pure helpers plus `utils/draggable/` only; `services/` is the state-machine layer (gif/library/pintura/collaboration request machines).

### Public-barrel export policy (deliberate, do NOT prune)

`src/index.ts` exports the editor's full API, not the subset today's hosts consume. Inkling is a host-agnostic editor island; "unused in kobato today" is not dead surface, tree-shaking owns dead-code elimination at each consumer's bundler, and pruning by consumer count would churn the public API on every product change (any removal is a breaking release). Do not "clean up" the barrel; extend it only with deliberately-public API.

## Architecture notes

Glossary owned here: **card** (a decorator-node block), **card adjacency**, **card spec**, **card declaration**, **render target**, **host card**, **artifact slot**, **render-time meta**.

### Card pipeline

- Cards collapse to declarations (`src/nodes/cards/*.declaration.ts`); `assembleCardNodeOnce` assembles the class once per card; `CARD_WRAPPER_NODES` derives from `CARD_DECLARATIONS`.
- `src/nodes/*Node.ts` are type-only shims exposing the assembled class, the base-canonical `$is*`, and the dataset type. Never import `@kobato/inkling/index` from a shim — import `@kobato/inkling/components/InklingCardWrapper` and `@kobato/inkling/nodes/MinimalNodes` directly. Base classes are `Base*Node` with `$createBase*Node`.
- Behaviour sits on the declaration (menu/insert/markdown) or the base class; nested-editor/transient specs are adopted via class statics only. A declaration carries menu entries (commands as `CardMenuCommand` strings, never the command table), insert flags, drag icon, and markdown eligibility (`CardMarkdownSpec`).
- Derived views go through `resolveCardFacts` (`src/nodes/cards/card-facts.ts`: built-in first, host fallback): `card-commands.ts` (exhaustive by node type), menu/drag-icon registries, decorate targets (`render*Card` in `src/nodes/*NodeComponent.tsx`, paired by `card-decorate.tsx`), and the fence payload table (`card-markdown-transformers.ts`).
- Spec arrays live in the base node module (`as const satisfies`); `CardSpecFieldMap` derives the shim's `__*` names and value types — renaming or retyping an entry is a compile error.
- Adding a card = a declaration plus the touch points in `src/nodes/cards/index.ts` (render export, command constant, labels keys, fence payload). Pins: `tests/unit/nodes/card-{cross-registry-consistency,declarations,layering-imports}.test.ts`.

### Menu dataset typing

- `CardDeclaration<'image', typeof BaseImageNode, typeof imageTransientProps, typeof imageNestedEditors>` (`readonly []` when absent); `CardMenuDataset` derives `insertParams`/`queryParams` keys from `getPropertyDefaults()` — bad keys or values are compile errors, and omitting them is NOT a fallback (`DeclaredCardMenuDataset` → `never`).
- `checkedCardDeclaration({ … } satisfies CardDeclaration<…>)`: `satisfies` keeps contextual typing; the identity wrapper exact-key-checks the inferred menu literal. `tests/typecheck/card-menu-params.ts` pins rejection and that every declaration's insert/query key belongs to its dataset.
- Host `defineCard` derives the same vocabulary from `B` plus `Transient`/`Nested` and rejects unknown keys on a DIRECT INLINE literal; pre-widened input (via variable, return, or annotation) is a type-erasure boundary and goes unchecked; `satisfies HostCardSpec` keeps `insertParams` checked but widens `queryParams` to `string`.

### Decorate slot

- `decorate()` goes through an injection slot: `src/nodes/card-decorate-slot.ts` (react-free) owns `registerCardDecorate(impl)` / `decorateCardNode(node)`; `assemble-card-node.ts` delegates to it. The adapter is `src/nodes/decorate-card.tsx` (every card component, CodeMirror included), keeping headless react-free.

### Editor surfaces

- Node sets derive from `EDITOR_BASE_NODES` (`src/nodes/DefaultNodes.ts`); plugins are two data lists — `CORE_PLUGINS` (`src/plugins/CorePlugins.tsx`, entries with `when` conditions) and `DEFAULT_FEATURE_PLUGINS` — snapshot-pinned by `tests/unit/plugins/derived-feature-plugin-sets.test.ts`.
- A custom host surface wraps its top-level tree in exactly one `InklingSurface` inside an `InklingComposer`, so nested card editors share the top-level undo stack and `onChange`.
- `alignment` defaults ON for the article surface; `focusMode` defaults OFF (host owns the toggle); `InklingAutoLinkPlugin` no-ops without AutoLinkNode; `TypographyPlugin` matches tiptap extension-typography minus the em-dash rule `EmEnDashPlugin` owns; IME composition protection is the update-scan seam's composing skip.

### Host cards

- `defineCard` (`src/nodes/cards/host-cards.ts`) takes one spec (base node via exported `generateDecoratorNode`, insert/menu/toolbar facts, decorate render); it validates, assembles, registers, and stores the raw spec in `host-card-registry.ts`, projected through the built-in projectors and intersected with each editor's registered node types. Pins: `tests/unit/nodes/host-cards.test.ts`.
- Type preservation: the returned `HostCard<…>` keeps const-asserted arrays' literal `__*` names and value types via `CardSpecFieldMap`/`CardSpecAccessorMap`; base classes interface-merge `CardSpecFieldMapFor` (no hand-written `declare __*`).
- Markdown: `src/markdown/round-trip.ts` composes every registered host card by default; a `markdownFence` transformer derives from the stored spec. The `cards` option AUGMENTS the default and replaces a nodeType collision; leave a card out by not declaring `markdownFence`.
- `getHostCardNodes()` (barrel-exported) returns every registered host card's class in registration order — hosts spread it into `<InklingComposer nodes>`; card modules' imports carry the `defineCard` side effects.
- Labels: host entries use `labelKey` `host.<name>`, resolved as `menu.host.<name>.label`/`.desc` through `<InklingComposer labels={...}>` (`InklingLabelsInput` opens exactly that template; the shipped `InklingLabels` table stays closed). Spec text is the fallback.

### Pick seam

- Host cards referencing host-owned entities declare `picker: { render, autoOpenOnInsert? }`; the dialog is host code. Dispatch rides the per-composer store (`card-picker-store.ts`, context `CardPickerStoreContext.tsx`): `useCardPicker().open(nodeKey)` or INSERT_CARD_COMMAND's `openPicker` flag, with `registerCardCommands` as the single write site. Command channel only; `open()` no-ops when not editable.
- `CardPickerHostPlugin` (a `CORE_PLUGINS` entry gated to non-nested, non-read-only surfaces) resolves via `resolveCardPicker` and mounts `picker.render({ editor, nodeKey, close, fromInsert })`. `registerCardPicker(nodeType, picker)` overrides a type with no host spec (which `defineCard` rejects): one picker per node type, enforced both ways, and it REJECTS `autoOpenOnInsert`.
- Lifecycle pin (`tests/unit/plugins/card-picker.test.tsx`): the request drops when the node leaves the document, when the picker unregisters, and on host unmount.
- Requests cross by node KEY, never the instance (Lexical #195); writes resolve the latest instance in `editor.update()` through `useCardChrome`. `fromInsert` merges the pick into the insert's history entry via `mergeHistory` (`HISTORY_MERGE_TAG`) — one Cmd+Z retracts both.
- The registry field is type-only React, so headless stays free of the seam. The barrel re-exports `COMMAND_PRIORITY_*` (name the level, never the number) and `createRenderContext` (react-free, but kept off headless).

### Node families

- Each card's renderer lives under `src/nodes/base/nodes/<card>/` with its spec arrays; the caption spec core is `caption-editor-spec.ts`. Node-coupled modules sit with consumers, not in `utils/` (`nodes/upload-intent.ts`, `nodes/cards/card-menu-build.ts`, `nodes/cards/editor-card-nodes.ts`, `nodes/nested-editors.ts`, `nodes/base/utils/image-card-widths.ts`, `hooks/bookmark-embed-flow.ts`). No utils module may runtime-import `@kobato/inkling/nodes` (except pure leaves under `nodes/base/utils/`), `components`, `hooks`, or `plugins` (`tests/unit/utils/utils-import-guard.test.ts`).
- Table family (`src/nodes/table/`): `INKLING_TABLE_NODES` re-exports the upstream trio and joins `EDITOR_BASE_NODES` after the link pair (AutoLinkNode extends LinkNode, so imported `<a>` stays LinkNode). `INSERT_TABLE_COMMAND` is our `plugins/behaviour/table.ts` command (3×3, header row only, never a header column), not upstream's `registerTablePlugin`. Cell guard (`table-cell-guard.ts`) allows one paragraph of inline content per cell as a default transform, covering the headless import path. Header policy is single-sourced in `table-facts.ts` (HTML export maps header cells to `<th>`; the GFM transformer forges row 0 as the header).
- Footnote pair: `FootnoteRefNode` is a TextNode entity whose visible text IS the 1-based citation index (renumber rewrites it in place); `footnote-anchors.ts` owns the `user-content-fn(N)`/`user-content-fnref(N)` contract. The definition is a menu-less declaration-pipeline card with one nested editor. Behaviour (`plugins/behaviour/footnotes.ts`): `^ ` trigger (backslash suppression, table-cell/code-block guard), `$syncFootnoteIndices` (first-citation order), `$removeFootnote`, and a RootNode transform keeping definitions one doc-end run. Export wraps the run in a `<section>` (`footnote-html-export.ts`); nested editors never get footnotes (insertion disabled, numbering never descends).
- Artifact slots stay opaque: `highlightedHtml` (Shiki) and `mathml`/`svg` (KaTeX) are host-filled on save (never in the browser, CSP); the `code`/`language`/`tex` setters clear the slot on edit, while construction and `importJSON` assign private fields so host-filled artifacts survive deserialization. Render-time meta rides `ExportDOMOptions.resolveRenderMeta` into the frozen render context, resolved by (kind, id) synchronously before export.

### Labels and word counting

- `src/labels/inkling-labels.ts` owns the closed flat table (dotted keys + English defaults); `<InklingComposer labels={...}>` merges a host override subset once; components use `useInklingLabels()`. `DEFAULT_LABELS` and its two types export from `@kobato/inkling` (`src/shared-exports.ts`); `tests/unit/labels.test.ts` snapshots the keys.
- ui-prefs flags: `isEmojiEnabled` (default true; `false` keeps `EmojiPickerPlugin` out of nested/caption editors only) and `codeEditor` (default `'rich'`; `'plain'` uses static `CodeBlockPlainEditor`, no codemirror chunk).
- Menu labels: each declaration entry (and the table pseudo-source) carries a required `labelKey`; `buildCardMenu` resolves `menu.${labelKey}.label`/`.desc`; declared English is the fallback.
- Word count: `language` drives `Intl.Segmenter` (`countWords(text, language)`) and publishes on the handle; `wordCountLanguage` (UI locale) seeds it; with both absent it stays `undefined` (published `null`) and `countWords` keeps its regex path. Hosts mount the plugin themselves. `onSelectionChange?: (count: number | null) =>` — `null` = collapsed/no selection; `0` = non-empty selection with zero words. A rendered editor's DOM root is the focus authority; `focusedEditor` serves rootless headless editors. `createWordCounter` owns both channels. State lives in a per-TOP-LEVEL-editor `WordCountState` WeakMap keyed by COUNTER INSTANCE identity — never globals; newest eligible editor wins. Dedup is PER CALLBACK. Pins: `tests/unit/plugins/behaviour/word-counter.test.ts`, `wordCountHandle.test.ts`, `tests/unit/plugins/WordCountPlugin.test.tsx`, `tests/unit/components/InklingNestedComposerWordCount.test.tsx`.
- Backtick chord (`plugins/behaviour/keyboard-navigation/shortcuts.ts`): unmodified backtick over a non-collapsed range selection dispatches `FORMAT_TEXT_COMMAND 'code'` via `dispatchCodeFormat` — one undo entry; collapsed selections, modifiers, Shift, and IME fall through. CodeMirror owns its own backtick. Pinned by `tests/unit/plugins/behaviour/backtick-code-selection.test.tsx`.

## Documented tradeoffs

- Content typography is NOT owned here: the host owns `packages/ui/src/styles/typeset.css` and passes `contentEditableClassName="typeset typeset-post|typeset-comment"`; `src/styles/components/inkling-prose.css` keeps only card rhythm, nested-editor chrome variants, the aside pull-quote, and the accent re-scope.
- `src/styles/index.css` is the package's complete Tailwind entry; consumers import it directly alongside their own independently compiled host styles — no consumer may add Inkling paths to its `@source`.
- Chrome arbitrary values are authored in rem, never px: the Kobato canvas runs `zoom: 2/3` on a 15px root. Web's host adapters bridge tokens (`--inkling-accent-color` ← `--brand`, `--font-sans` ← `--font-body`).
- `@kobato/inkling/headless` (zero React) is the server-side conversion surface only and the server bundle's ONLY editor import, which also takes `generateDecoratorNode` plus `DecoratorNodeProperty` from it. `RenderContext` / `ExportDOMOutput` stay internal; the barrel's shared contract is single-sourced in `src/shared-exports.ts` — add shared names there, never in the barrel.
- Headless bypasses `shared-exports` (it would pull the React tree in), and the barrel never re-exports headless conversion modules: `headless-html` reaches jsdom through `headless-dom`'s lazy import, so a re-export would drag jsdom into the client graph (`tests/unit/html/jsdom-import-guard.test.ts`). `version` reads `__APP_VERSION__`.
- Lazy runtimes keep the island chunk free of them: emoji-mart (`plugins/behaviour/emoji-completion.ts` + the `EmojiPickerPortal` behind `React.lazy`), markdown-it (`markdown/lazy-paste-dialect.ts`, pre-warmed on mount), CodeMirror (`components/ui/cards/LazyCardEditor.tsx`, static fallback on SSR/first render), `yjs`/`y-websocket` (`enableMultiplayer` + `services/lazy-collaboration.ts`, with `useCollaborationProviderFactory` the React adapter). `fast-average-color` stays eager.
- Composition defaults: `InklingComposer`'s `nodes` prop is OPTIONAL (defaults to `DEFAULT_NODES`) while `components/InklingComposerBase.tsx` requires it; `MarkdownShortcutPlugin` defaults to the card-free `MINIMAL_TRANSFORMERS` (`InklingEditor` passes `DEFAULT_TRANSFORMERS`).
- Base node classes must not reuse DOM global names — hence `Base*Node` (e.g. `BaseAudioNode`). React Compiler runs on the layer.
- The headless HTML API lazily imports `jsdom` behind `src/html/headless-dom.ts` — the only module that may import it; `lexicalStateToHtml` owns the render recipe, `src/html/headless-editor.ts` the shared assembly with merge modes (renderer/plain-text `additive` vs importer `wholesale`). Do not add a second jsdom importer.

## Testing

- Vitest, jsdom, globals off (explicit `vitest` imports), its own project (`tests/vitest.config.ts`), part of root `pnpm run test`; `packages/inkling/src/**` is excluded from the root coverage gate.
- `vitest.config.ts` inlines `@testing-library/jest-dom` (`server.deps.inline`); externalizing it splits the snapshot/expect singletons and breaks every `toMatchSnapshot`. Keep that inline entry.
- Rendered-card specs need the decorate adapter: `tests/utils/test-editor.ts` registers it, bespoke `createEditor` specs call `registerCardDecorateAdapter()` at module scope, and an unregistered slot throws on first card render.

## Before finishing work

1. Run `pnpm run type`, `pnpm run lint`, and `pnpm test:inkling`.
2. Run `pnpm run fmt` if you changed imports.
3. Do not commit secrets or external fixture URLs for removed integrations.
