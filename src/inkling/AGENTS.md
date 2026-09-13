# AGENTS.md — Inkling editor layer

## Overview

- `src/inkling/` is kobato's rich-text editor layer — the squashed inkling snapshot at 601961b0
  (formerly the `@inkling/editor` workspace package in `packages/inkling`), dissolved into the app
  tree. Lexical-based, React 19, TypeScript, Lexical 0.46.
- The layer stays host-agnostic: it imports nothing from kobato's other layers. The rest of the app
  consumes it ONLY through two entry surfaces, pinned by
  `tests/unit/shared/contracts/boundaries.test.ts`:
  - `@/inkling` — the React barrel (`src/inkling/index.ts`), used by `client/` / `ui/` / `routes/`.
    It calls `registerCardDecorateAdapter()` at module top level — a bare side-effect import would
    be tree-shaken away, so the registration MUST stay an explicit top-level statement in the
    barrel.
  - `@/inkling/headless` — the react-free conversion surface (`src/inkling/headless.ts`), the only
    surface `server/` and `shared/` may use.
- The old `/core` entry is gone (it had zero consumers); `InklingComposerBase` remains for card-free
  compositions.
- Source: `src/inkling/`, tests: `tests/inkling/` (a dedicated vitest project), demo: `demo/` at the
  repo root.

## Essential commands

Run these from the kobato root:

```bash
pnpm run type        # root tsc + tsc -p tests/inkling/tsconfig.json
pnpm run lint        # oxlint (root config)
pnpm test:inkling    # vitest run --project inkling
pnpm run fmt         # oxfmt --write with the root config (covers src/inkling, tests/inkling, demo)
pnpm run fmt:check   # oxfmt --check with the root config
pnpm demo            # vite demo — the standalone demo app (not part of the type/test/build gates)
```

## Code style

- Formatter/linter: `oxfmt` and `oxlint`, configured ONLY at the kobato root (`oxfmt.config.ts`,
  `oxlint.config.ts`) — this layer carries no config files of its own. The root oxlint config scopes
  inkling's documented exceptions in a `src/inkling/**` override (public barrel, intentional Lexical
  cycles, class+interface merging, editor-chrome a11y exemptions, and the keeper rules —
  eqeqeq/no-eval/no-plusplus/no-explicit-any etc. — that the kobato codebase itself is not clean
  under); the root oxfmt config points Tailwind sorting at `src/inkling/styles/index.css` with
  `clsx` through its own override (`src/inkling/**`, `demo/**`).
- Single quotes, no semicolons, trailing commas, print width 120.
- Tailwind classes scoped under `.inkling-lexical`.
- Import sorting is handled by `oxfmt`.
- `oxlint` runs type-aware (oxlint-tsgolint, TS7-based) with `typeCheck` on. tsgolint discovers each
  file's nearest `tsconfig.json`; the inkling suite's discovery anchor is
  `tests/inkling/tsconfig.json` (it extends the root tsconfig and adds the vitest-globals/jest-dom
  types the suite needs). The root tsconfig's `verbatimModuleSyntax` means type-only imports must
  use `import type`. Note: tsgolint caches its program state — if a tsconfig edit produces a sudden
  flood of `TS2339`-style errors across test files, re-run `pnpm run lint` once before believing it.

## Architecture notes

- Domain glossary terms used below: **card** (a decorator-node block), **card adjacency**, **card
  spec**, **card declaration**, **render target**, **host card**, **artifact slot**, **render-time
  meta**. This file is the term owner.
- `src/inkling/index.ts` is the public barrel. Do **not** import from `@/inkling/index` inside
  `src/inkling/nodes/*Node.ts` shim files; import shared primitives directly
  (`@/inkling/components/InklingCardWrapper`, `@/inkling/nodes/MinimalNodes`).
- Every card is collapsed to its declaration (`src/inkling/nodes/cards/*.declaration.ts`): the
  registered class is assembled exactly once per card by the memoized `assembleCardNodeOnce` in
  `src/inkling/nodes/assemble-card-node.ts`, and `CARD_WRAPPER_NODES` in
  `src/inkling/nodes/cards/card-wrappers.ts` is derived from `CARD_DECLARATIONS`. The
  `src/inkling/nodes/*Node.ts` paths are type-only shims re-exporting the assembled class (via
  `assembleCardNodeOnce`), the base-canonical `$is*`, and their dataset type. Base node classes are
  named `Base*Node` (e.g. `BaseAudioNode`) with a `$createBase*Node` factory; the public `*Node`
  name / `$create*Node` factory belong to the shim and construct the assembled class. Card-specific
  behaviour lives on the declaration (menu/insert/markdown facts) or the base class (e.g. `isEmpty`);
  nested-editor/transient specs are adopted via class statics only — the generator's options bag has
  no `nestedEditors` entry. Each card declaration also carries its card-menu entries (naming
  commands by string via `CardMenuCommand` — never importing the command table), insert-spec flags,
  drag icon, and markdown eligibility (`CardMarkdownSpec`: `{ kind: 'fence' }` or
  `{ kind: 'exempt' }`) — `src/inkling/nodes/cards/card-commands.ts` (command constants keyed
  exhaustively by node type, resolved through
  `resolveCardInsertCommand`/`resolveCardMenuCommand`), the menu/drag-icon registries, the decorate
  targets (each card's `render*Card` export lives beside its component in the
  `src/inkling/nodes/*NodeComponent.tsx` files, paired by `src/inkling/nodes/cards/card-decorate.tsx`),
  and the fence payload table in `src/inkling/nodes/cards/card-markdown-transformers.ts` (keyed
  exhaustively by the fence-eligible declarations; payloads stay one layer up because their
  `createNode` must construct the wrapper class) are derived views over the declarations. Adding a
  card means writing a declaration plus the touch points listed in `src/inkling/nodes/cards/index.ts`
  (render export, command constant, labels keys, fence payload as applicable) — the mechanically
  checkable ones are pinned by `tests/inkling/unit/nodes/card-cross-registry-consistency.test.ts`
  and `card-declarations.test.ts`. Every derived view resolves its facts through one merge-policy
  module (`resolveCardFacts` in `src/inkling/nodes/cards/card-facts.ts`: built-in declaration first,
  host registry fallback), and each card's transient/nested-editor spec arrays live in its base node
  module (still `as const satisfies` — the declaration imports them from there), so
  `CardSpecFieldMap` (exported from the barrel) derives the shim's `__*`
  field names AND value types from the declaration (transient `initial` lambdas carry the value type;
  a nested-editor entry's `nullable: true` carries `LexicalEditor | null`) while the base class
  self-types the same vocabulary by interface-merging `CardSpecFieldMapFor` over the arrays its
  module owns — renaming or retyping a spec entry is a
  compile error at every consumer. The pipeline's layering rule is pinned by a static import guard
  (`tests/inkling/unit/nodes/card-layering-imports.test.ts`).
- Card `decorate()` goes through an injection slot, not a direct import:
  `src/inkling/nodes/card-decorate-slot.ts` (react-free) owns `registerCardDecorate(impl)` /
  `decorateCardNode(node)`, `assemble-card-node.ts`'s `decorate()` delegates to the slot, and the
  real adapter lives in `src/inkling/nodes/decorate-card.tsx` (which pulls in every card component,
  CodeMirror included). This inversion is what keeps `@/inkling/headless` react-free: the
  markdown/HTML importers construct card nodes without dragging the component tree into the bundle.
  The `@/inkling` barrel (`src/inkling/index.ts`) calls `registerCardDecorateAdapter()` at module
  top level — the registration stays an explicit top-level statement by convention, since a bare
  side-effect import would be tree-shaken away. Tests that build editors outside
  `tests/inkling/utils/test-editor.ts` (which registers it) must call
  `registerCardDecorateAdapter()` themselves; an unregistered slot throws a descriptive error the
  first time a card node renders.
- Top-level editor surfaces are presets over one composition rule: node sets derive from
  `EDITOR_BASE_NODES` (src/inkling/nodes/DefaultNodes.ts), and the plugin surface is two data
  lists — `CORE_PLUGINS` (src/inkling/plugins/CorePlugins.tsx: the mount set every
  `InklingComposableEditor` renders, entries carry `when` mount conditions and consume a typed
  `CorePluginScope`) plus `DEFAULT_FEATURE_PLUGINS` (src/inkling/plugins/DefaultFeaturePlugins.tsx) —
  enumerable and snapshot-pinned by `tests/inkling/unit/plugins/derived-feature-plugin-sets.test.ts`.
  A custom host surface wraps its top-level tree in exactly one `InklingSurface` (exported from
  `src/inkling/index.ts`) inside an `InklingComposer` so nested card editors share the top-level
  undo stack and `onChange`. Two surface-level toggles ride `InklingComposableEditor`'s props:
  `alignment` (default ON for the InklingEditor article surface, off elsewhere) both keeps element
  `format` through the default transforms and exposes the floating toolbar's alignment group
  (left/center/right on paragraph/heading/quote — tiptap TextAlign parity; surgery/state/visibility
  live in `src/inkling/plugins/behaviour/format-toolbar.ts`), `focusMode` (default OFF everywhere —
  the host owns the toggle) mounts the `focus-mode` core entry (`FocusModePlugin`): the headless
  behaviour (`src/inkling/plugins/behaviour/focus-mode.ts`) puts `inkling-focus-mode` on the root
  element and `data-inkling-focus-active` on the selected top-level block (a DOM walk, so editing
  inside a card's nested editor focuses the whole card), and host CSS dims the rest — tiptap
  extension-focus parity delivered as a real UX, since tiptap's `tiptap-focus-node` class was dead
  config with no CSS consumer. Separately, the always-mounted `InklingAutoLinkPlugin` core entry
  (matcher policy in `src/inkling/plugins/behaviour/autolink.ts`) no-ops on surfaces composed
  without AutoLinkNode. The `typography` feature plugin (`TypographyPlugin`, grammar in
  `src/inkling/plugins/behaviour/typography.ts`) aligns with tiptap extension-typography's default
  rule set minus the em-dash rule `EmEnDashPlugin` already owns; IME composition protection is the
  update-scan seam's composing skip, shared with EmEnDash/HorizontalRule.
- Hosts declare their own cards through the public `defineCard` seam
  (src/inkling/nodes/cards/host-cards.ts): one spec carries the base node (built with the exported
  `generateDecoratorNode`), insert/menu/toolbar facts, and the decorate render; `defineCard`
  validates, assembles, and registers, and the raw spec lands in the host registry
  (src/inkling/nodes/cards/host-card-registry.ts, kept registry-only so the derived views can read
  it without import cycles) — a neutral fact store whose projections every derived view computes
  through the same projectors the built-in declarations use, intersected with each editor's
  registered node types.
- Each card has a renderer under `src/inkling/nodes/base/nodes/<card>/`. The same per-card module
  houses the card's transient/nested-editor spec arrays (imported by its declaration); the shared
  caption spec core lives beside them in `base/nodes/caption-editor-spec.ts` — its MINIMAL_NODES
  import runs against the layer grain but closes no cycle, since the node sets compose only base
  leaves (the same direction `generate-decorator-node` already depends on through
  `nodes/nested-editors`).
- `src/inkling/utils` is the bottom layer : node-coupled modules live with their consumers — the
  upload intents in `src/inkling/nodes/upload-intent.ts`, the card-menu build and the
  registered-cards projection in `src/inkling/nodes/cards/card-menu-build.ts` /
  `editor-card-nodes.ts`, the nested-editor bootstrap in `src/inkling/nodes/nested-editors.ts`, the
  image width policy in `src/inkling/nodes/base/utils/image-card-widths.ts`, the bookmark embed flow
  in `src/inkling/hooks/bookmark-embed-flow.ts`. The boundary is pinned statically by
  `tests/inkling/unit/utils/utils-import-guard.test.ts`: no utils module runtime-imports
  `@/inkling/nodes` (except the shared pure leaves under `@/inkling/nodes/base/utils/`),
  `@/inkling/components`, `@/inkling/hooks`, or `@/inkling/plugins`. `CARD_WIDTHS` has one barrel
  home — the public `src/inkling/utils/index.ts` re-export; internal consumers import the source
  `@/inkling/nodes/base/utils/card-widths` directly.
- The table family (`src/inkling/nodes/table/`) is a non-card element family: `INKLING_TABLE_NODES`
  re-exports upstream's `TableNode`/`TableRowNode`/`TableCellNode` and joins `EDITOR_BASE_NODES`
  after the link pair (LinkNode + AutoLinkNode — AutoLinkNode powers the default autolink plugin and
  extends LinkNode without replacing it, so imported `<a>` markup still lands as plain LinkNode;
  `DEFAULT_HTML_NODES` registers it too, since typed-URL autolinks serialize as type `autolink`).
  Its slash/plus menu entry is a pseudo `CardMenuSource` (`table-menu.ts`) that `useCardMenu` merges
  only when the editor registers TableNode; `INSERT_TABLE_COMMAND` is our own behaviour-layer
  command (`src/inkling/plugins/behaviour/table.ts`, 3×3 with header row by default — header row
  only, never a header column), not upstream's registerTablePlugin; its handler plus upstream's
  selection observer (Tab navigation, cell-range selection) make up `InklingTablePlugin` in
  `DEFAULT_FEATURE_PLUGINS`. The cell guard (`table-cell-guard.ts` — a cell holds exactly one
  paragraph of inline content; math-inline is dropped, footnote-ref joins the illegal list when it
  exists) is a default transform so it also covers the headless import path. The family is
  deliberately absent from `@/inkling/nodes/base` DEFAULT_NODES; `DEFAULT_HTML_NODES` appends it
  after the base run instead, so the headless HTML API imports and renders tables by default — which
  is what makes the cell guard's headless-import coverage real. Export header policy is
  single-sourced in `src/inkling/nodes/table/table-facts.ts`: the live HTML export reads the header
  state through a tree-direct transformer
  (`src/inkling/html/renderer/transformers/element/table.ts`: header cell ⇔ `<th>`), while the GFM
  pipe-table transformer in `src/inkling/markdown/round-trip.ts` forges row 0 as the header
  (hand-written because `@lexical/markdown` 0.46 ships no TABLE transformer).
- The footnote pair is a TextNode entity plus a menu-less card on the declaration pipeline.
  `FootnoteRefNode` (`src/inkling/nodes/footnote/FootnoteRefNode.ts`) is a TextNode entity (TKNode
  precedent: `isTextEntity()` + the `canInsertText*` pair) whose visible text IS the 1-based
  citation index — the renumber engine rewrites the text in place, so no index field can drift from
  what the reader sees; `footnote-anchors.ts` is the single owner of the
  `user-content-fn(N)`/`user-content-fnref(N)` anchor contract, and `footnote-keys.ts` recasts every
  imported ref's `targetKey` (import-is-a-new-entity). The definition is a declaration-pipeline card
  with no menu/insert command/drag icon and one nested editor (`content`). The headless behaviour
  lives in `src/inkling/plugins/behaviour/footnotes.ts`: the `^ ` caret trigger
  (`FOOTNOTE_INSERT_TRIGGER_REGEX = /(\s|^)\^ $/` — narrower than kobato on purpose, with backslash
  suppression and the table-cell/code-block guard ported from kobato's `canInsertFootnoteMark`), the
  renumber engine `$syncFootnoteIndices` (refs in first-citation order, orphan definitions tailed in
  stored order, the whole sync skipped when a ref targets a missing definition, signature
  short-circuit), `$removeFootnote` (definition card plus every citing ref; the reverse is not
  done — a ref-less definition stays as a tailed orphan), and a RootNode transform keeping
  definitions one contiguous doc-end run. `FootnotePlugin` (key `footnote` in
  `DEFAULT_FEATURE_PLUGINS`) is only the React/DOM adapter. Export wraps the run in a footnotes
  `<section>` via the subsystem's registered post-processor
  (`src/inkling/nodes/footnote/footnote-html-export.ts` on the string layer's post-processing seam,
  `src/inkling/html/renderer/post-process.ts`; the heading title resolves through
  `resolveExportPolicy('footnotes-section-title')` with the deprecated `footnotesSectionTitle` flat
  key forwarding, blank falls back to "Footnotes"), and the ref splices inline through the
  `isInlineMarkupEntity()` dispatch. Known v1 gap: nested editors are separate editor instances, so
  footnote insertion is disabled there and numbering never descends into them.
- Server-prerendered artifact slots stay opaque node data : the code card's `highlightedHtml`
  (Shiki) and the math family's `mathml`/`svg` (KaTeX) are filled host-side on save — inkling never
  runs either in the browser (CSP) — and the base-node source setters (`code`/`language`/`tex`)
  clear the slot on edit. Request-scoped render-time meta rides `ExportDOMOptions.resolveRenderMeta`
  into the frozen render context, letting a host card resolve enrichment by (kind, id)
  synchronously — exportDOM is a sync pipeline, so hosts resolve before rendering.
- User-visible chrome strings come from one closed flat labels table (host reference
  `src/inkling/labels/inkling-labels.ts`): `src/inkling/labels/inkling-labels.ts` owns the dotted
  keys + English defaults, `<InklingComposer labels={...}>` merges a host override subset once into
  `InklingUiPrefsContext.labels`, and components read via `useInklingLabels()`. Menu labels stay
  indirect — each card declaration's menu entry (and the table pseudo-source) carries a required
  `labelKey`, and `buildCardMenu` resolves `menu.${labelKey}.label`/`.desc` through the resolver
  `useCardMenu` injects; the declared English is the fallback. `DEFAULT_LABELS` + the two types are
  exported from the `@/inkling` barrel (single-sourced in `src/inkling/shared-exports.ts`);
  `tests/inkling/unit/labels.test.ts` snapshots the key list. The same seam wires `WordCountPlugin`'s
  `language` prop to `Intl.Segmenter` word counting (`countWords(text, language)`), with `language`
  published on the word-count handle so nested editors match.

## Documented tradeoffs

- Content typography (headings, paragraphs, lists, quotes, code rhythm) is NOT owned by this layer:
  kobato replaced `@tailwindcss/typography` with an owned typeset layer
  (`src/styles/typeset.css` in the host), and the host passes
  `contentEditableClassName="typeset typeset-post|typeset-comment"` into `InklingComposableEditor`
  so the canvas shares the rendered presets. `src/inkling/styles/components/inkling-prose.css` keeps
  only card rhythm, nested-editor chrome variants, the aside pull-quote, and the accent re-scope.
  The typeset guard honors `.not-inkling-prose` and `.inkling-blockquote-alt`.
- The editor stylesheet is consumed as source: `src/inkling/styles/index.css` is imported by the
  host's two partials (`src/styles/inkling-editor.css`, `src/styles/inkling-comment-editor.css`)
  into the `inkling` cascade layer, pinned below `utilities` by the bare `@layer` ordering
  statements in `admin.css` / `public.css` so host-card Tailwind utilities beat inkling's scoped
  preflight. Both partials import `src/styles/dark-variant.css` before the package sheet so its
  `dark:` utilities compile with kobato's class-or-media variant instead of Tailwind's default
  media-only one. The theme-token parity lives in those partials' token bridge (`--inkling-accent-color`
  ← `--brand`, `--font-sans` ← `--font-body`) — that bridge is what keeps the canvas on kobato's
  design tokens. The old `./core.css` split no longer exists.
- The public markdown round-trip API (`src/inkling/markdown/round-trip.ts`) intentionally uses a
  constrained node set and does not round-trip decorator cards.
- There are no build artifacts and no package boundaries — consumers import source. `@/inkling` is
  the full editor; `@/inkling/headless` (zero React) is the server-side conversion surface — the
  HTML/markdown/plain-text state converters and nothing else; kobato's server bundle imports the
  editor ONLY through this surface. Kobato R10 also consumes `generateDecoratorNode` (plus the
  `DecoratorNodeProperty` type) from this surface: the host's React-free card base classes register
  straight into the converter node lists — the same pattern `DEFAULT_HTML_NODES` uses for the
  built-in cards' `baseNode`s. The `RenderContext` / `ExportDOMOutput` types deliberately stay
  internal: hosts declare structural slices instead (kobato's `CardRenderContext`). The barrel's
  shared contract (Lexical runtime types, host-config types, labels, the library browser, the
  card-free composition pieces, `version`) is single-sourced in `src/inkling/shared-exports.ts` —
  add shared names there, never in the barrel directly. `@/inkling/headless` deliberately does NOT
  go through `shared-exports` (it would pull the React component tree in). `version` reads kobato's
  `__APP_VERSION__` build-time define. Feature runtimes (markdown-it, CodeMirror, emoji-mart,
  fast-average-color) are ordinary root dependencies; `yjs`/`y-websocket` are the one exception —
  `enableMultiplayer` awaits a lazily imported collaboration chunk at runtime (the load session is
  headless: `src/inkling/utils/services/lazy-collaboration.ts` behind an import port, with
  `useCollaborationProviderFactory` the React adapter), so the barrel stays free of them until
  used. The retired `/core` entry's two composition defaults survive in the components themselves:
  `InklingComposer`'s `nodes` prop is OPTIONAL (defaults to `DEFAULT_NODES`) while
  `src/inkling/components/InklingComposerBase.tsx` — the card-free composer — requires it, and
  `MarkdownShortcutPlugin`'s default transformer set is the card-free `MINIMAL_TRANSFORMERS`
  (`InklingEditor` passes `DEFAULT_TRANSFORMERS` explicitly).
- Base node classes must not reuse DOM global names — this is why every base class is `Base*Node`
  (e.g. `BaseAudioNode`, not `AudioNode`): the convention dates from the dts-bundling era
  (declaration bundlers collided with lib.dom.d.ts) and stays. React Compiler runs on the layer: the
  app build compiles it via `@vitejs/plugin-react`'s `compiler: true`, and the inkling vitest
  project compiles the same way so tests exercise the compiled semantics.
- The headless HTML API lazily imports `jsdom` (a plain root devDependency now) behind
  `src/inkling/html/headless-dom.ts` (the headless DOM port) — the only module that may import it;
  `tests/inkling/unit/html/jsdom-import-guard.test.ts` enforces that statically. The public
  `lexicalStateToHtml` owns the render recipe (no internal renderer class); the shared
  headless-editor assembly lives in `src/inkling/html/headless-editor.ts` with named merge modes
  (renderer/plain-text `additive` vs importer `wholesale`). Do not add a second jsdom importer.

## Testing

- Vitest, jsdom environment, globals enabled — its own project (`tests/inkling/vitest.config.ts`;
  the include list mirrors the layer: `unit/`, `utils/`, `clean-basic-html/`, `html-api/`,
  `html-to-lexical/`, `html-renderer/`, `markdown/`, `transforms/`, `nodes-base/`). The project is
  part of the root `pnpm run test`; `src/inkling/**` is excluded from the root coverage gate (the
  suite's historical thresholds sit below the root 60).
- `vitest.config.ts` inlines `@testing-library/jest-dom` (`server.deps.inline`): its vitest entry
  imports `vitest`, and externalizing it splits the snapshot/expect singletons and breaks every
  `toMatchSnapshot`. Keep that inline entry.
- Rendered-card specs need the decorate adapter registered (see the architecture note above):
  `tests/inkling/utils/test-editor.ts` registers it for the shared harness; bespoke `createEditor`
  specs call `registerCardDecorateAdapter()` at module scope.

### AI-friendly vs human-friendly entry points

AI agents (scripted, parseable output):

- `pnpm test:inkling` — full inkling suite; `npx vitest run --project inkling <file>` for one file.
- `pnpm run type`, `pnpm run lint`, `pnpm run fmt:check` — static gates.

Humans (interactive, visual):

- `npx vitest --project inkling` — Vitest watch mode.
- `pnpm demo` — the standalone demo app.

## Before finishing work

1. Run `pnpm run type`, `pnpm run lint`, and `pnpm test:inkling`.
2. Run `pnpm run fmt` if you changed imports.
3. Do not commit secrets or external fixture URLs for removed integrations.
