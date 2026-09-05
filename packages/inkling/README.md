# Inkling - Lexical edition

Inkling editor, based on the Lexical framework.

## Installation

The package is published as **`@inkling/editor`**.

```bash
pnpm add @inkling/editor react react-dom
```

## Peer dependencies and bundled runtimes

`react` and `react-dom` (^19) are the only peer dependencies — install them in your app; they are externalized from the bundle and resolve from the consumer.

All card and collaboration runtimes are **bundled** into the published artifacts, so importing the package root never requires installing card-specific packages:

- `markdown-it` and its plugins (Markdown card)
- `@uiw/react-codemirror`, `@uiw/codemirror-extensions-basic-setup`, and `@codemirror/*` (CodeBlock and HTML cards)
- `emoji-mart`, `@emoji-mart/data`, and `@emoji-mart/react` (emoji picker)
- `fast-average-color` (Header card color extraction)
- `yjs` and `y-websocket` (multiplayer/collaboration via `enableMultiplayer` on `InklingComposer`)

Optional features remain inactive until used, but no consumer package installation is required to activate them. The tradeoff is a larger distribution bundle; cards are not individually tree-shakeable from the root entry.

## Module formats

The package exposes both ESM and CommonJS entry conditions:

- `import { InklingEditor } from '@inkling/editor'` resolves to `dist/editor.js` (ESM).
- `require('@inkling/editor')` resolves to `dist/editor.umd.cjs` (CommonJS).
- `dist/editor.umd.js` remains as a legacy browser/direct-path artifact with a runtime body identical to the `.cjs` file (only its sourcemap trailer differs); Node's `require` condition resolves the `.cjs` file.

## The `./core` entry

`@inkling/editor/core` is a second, card-free entry for comment-level compositions — a surface that wants the editor chrome and inline formatting without paying for the card runtimes (CodeMirror, emoji data, the card UIs) or `yjs` in its bundle. It is ESM-only; CommonJS consumers keep using the root entry.

```tsx
import { InklingComposer, InklingSurface, MINIMAL_NODES, MINIMAL_TRANSFORMERS } from '@inkling/editor/core'
import '@inkling/editor/core.css'
;<InklingComposer nodes={MINIMAL_NODES} initialEditorState={state}>
  <InklingSurface
    onChange={onChange}
    singleParagraph
    markdownTransformers={MINIMAL_TRANSFORMERS}
    isDragEnabled={false}
  />
</InklingComposer>
```

Two composition defaults differ from the root entry:

- `nodes` is **required** on `InklingComposer` — the host names its node set (`MINIMAL_NODES`, `BASIC_NODES`, or its own array) instead of defaulting to the full card set.
- `MarkdownShortcutPlugin`'s default transformer set is `MINIMAL_TRANSFORMERS` everywhere, so a bare `InklingSurface` gets no heading/list/code-fence shortcuts unless the host passes transformers explicitly.

The entry exports only the card-free surface: `InklingComposer`, `InklingSurface`, `InklingComposableEditor`, `RestrictContentPlugin`, the `MINIMAL`/`BASIC` node and transformer sets, and the host-config and Lexical types those props name. `DEFAULT_NODES`, the card shims, the feature plugins, and the markdown/HTML conversion APIs stay on the root entry. `core.css` carries the same stylesheet as `style.css` today (CSS is not layered yet). Collaboration (`enableMultiplayer`) still works from either entry — the `yjs`/`y-websocket` runtime loads as a lazy chunk at runtime.

## TypeScript

The package publishes a bundled declaration file per entry — `dist/editor.d.ts` for the root and `dist/core.d.ts` for `./core` — wired through each entry's `types` export condition (and the top-level `types` field for the root), so both resolve under `moduleResolution: "Bundler"` and `"NodeNext"` alike.

Types for every bundled runtime (Lexical, markdown-it, CodeMirror, emoji-mart, etc.) are **inlined** into the declaration, so consumers only need their own React types — no second Lexical or card-runtime install for the type checker:

```tsx
import { InklingEditor, type InklingEditorProps } from '@inkling/editor'

const props = {
  placeholderText: 'Start writing…',
  onChange: (state) => console.log(state),
} satisfies InklingEditorProps
```

The only type-level externals are the `react`/`react-dom` peer family. Import everything — components, hooks, node factories, datasets, and command payloads — from the package root; deep `dist/*` or source paths are not part of the supported API.

## Public API

Everything below is exported from the package entry point.

### Markdown API

- `markdownToLexicalState` / `lexicalStateToMarkdown` — synchronous round-trip conversion between markdown strings and serialized Lexical editor states, exported from the package root.

### Components

- `InklingEditor` — ready-to-use editor with all default plugins wired in.
- `InklingComposableEditor` — editor shell for composing your own plugin set.
- `InklingComposer` — low-level Lexical composer (theme, nodes, error handling, optional multiplayer via `enableMultiplayer`).
- `InklingNestedComposer` — composer for nested editors inside cards.

### Plugins

Around 20 plugins are exported:

`CardInsertPlugin`, `CardMenuPlugin`, `DefaultFeaturePlugins`, `DragDropPastePlugin`, `DragDropReorderPlugin`, `EmEnDashPlugin`, `EmojiPickerPlugin`, `ExternalControlPlugin`, `FloatingToolbarPlugin`, `HorizontalRulePlugin`, `HtmlOutputPlugin`, `InklingBehaviourPlugin`, `InklingSelectorPlugin`, `InklingSnippetPlugin`, `ListPlugin`, `MarkdownShortcutPlugin`, `PlusCardMenuPlugin`, `ReplacementStringsPlugin`, `RestrictContentPlugin`, `SlashCardMenuPlugin`, `TKCountPlugin`, `WordCountPlugin`.

Most map to a card or an obvious editor feature. The less obvious ones:

- `DefaultFeaturePlugins` — the feature plugin bundle `InklingEditor` adds on top of the core plugins `InklingComposableEditor` always mounts.
- `CardInsertPlugin` — registers every card's insert command, derived from the card declarations.
- `InklingBehaviourPlugin` — core keyboard and paste behaviors plus card commands.
- `CardMenuPlugin` — bundles `PlusCardMenuPlugin` and `SlashCardMenuPlugin`.
- `EmEnDashPlugin` — auto-replaces typed hyphens with em/en dashes.
- `ExternalControlPlugin` — exposes an imperative API (`serialize`, `focusEditor`, `insertParagraphAtTop/Bottom`, etc.).
- `HtmlOutputPlugin` — emits the editor's HTML output via callback, with optional debounce.
- `InklingSelectorPlugin` — GIF selector commands for image nodes.
- `InklingSnippetPlugin` — inserts predefined content snippets.
- `ReplacementStringsPlugin` — rewrites `{placeholder, "fallback"}` template strings in text nodes.
- `RestrictContentPlugin` — restricts content to a maximum number of plain paragraphs, stripping cards and other block types.
- `TKCountPlugin` — reports the count of "TK" placeholder markers via `onChange`.

### Node sets

- `DEFAULT_NODES` — full node set for the standard editor (all cards plus extended text/heading/quote nodes).
- `BASIC_NODES` — lists, links, and TK nodes.
- `MINIMAL_NODES` — extended text, links, and TK nodes; the smallest viable set.

### Transformers

Markdown shortcut transformer sets for the different editor variants:

- `DEFAULT_TRANSFORMERS` — full set used by the standard editor.
- `BASIC_TRANSFORMERS` — lists plus inline formatting.
- `MINIMAL_TRANSFORMERS` — inline formatting only.
- `ELEMENT_TRANSFORMERS` — block-level transformers (headings, quotes, lists, horizontal rules, code blocks).
- `HR_TRANSFORMER` / `CODE_BLOCK_TRANSFORMER` — individual transformers for `---` rules and fenced code blocks.

### Config and utilities

- `version` — the package version string (`development` outside built bundles).
- Utilities — the utils barrel exposes `slugify`, `countWords`, `Color` / `textColorForBackgroundColor`, `debounce` / `throttle`, `escapeRegExp` / `kebabCase` / `pick`, and the selection helpers `$isAtStartOfDocument`, `$selectDecoratorNode`, `$isAtTopOfNode`, and `getTopLevelNativeElement`.

## Development

The editor runs in standalone mode via the demo app.

### Standalone mode

Run `pnpm dev` to start the editor in standalone mode for development on http://localhost:5173. This command generates a demo site from the `index.html` file, which renders the demo app in `demo/demo.tsx`.

The default surface (`/`) loads a showcase document containing one of every card — toggle, callout, header, image, gallery, video, audio, file, bookmark, button, code block, HTML, math, divider, table, the music-player host card, and a footnote pair (media cards start as upload placeholders so the upload flow is right there). The ✨ Features button (top right) lists every feature and how to trigger it. Other surfaces: `/basic`, `/minimal`, `/multiplayer` (needs `pnpm dev:multiplayer`), `/contentrestricted`, `/html-output`, `/designsandbox`.

Demo-only query params and env vars:

- `?imageLibrary=fixture` (or `fixture-upload`) — the fixture media library, no backend needed
- `?renderMath=stub` — stubbed server-KaTeX preview channel for the math card
- `?labels=zh` — Chinese label overrides · `?searchLinks=false` — no internal linking · `?darkMode=true` · `?content=false` — blank start
- `VITE_PINTURA_JS_URL` + `VITE_PINTURA_CSS_URL` — point the demo at a licensed Pintura build to test image editing (the SDK is a runtime CDN import, never bundled)

### Specific card setup

#### Gif card

To see this card locally, create a `.env.local` file in the project root with a GIF provider key:

```
VITE_KLIPY_API_KEY=xxx
# or, for the legacy Tenor provider:
VITE_TENOR_API_KEY=xxx
```

The card resolves to Klipy when `VITE_KLIPY_API_KEY` is set, otherwise Tenor. Get a Klipy key at https://partner.klipy.com; the Tenor key is described at https://inkling.org/docs/config/#tenor

#### Bookmark cards

Pasting a URL into an empty paragraph creates a bookmark card. Bookmark cards make external web requests to fetch link metadata (title, description, thumbnail). Since the demo doesn't have a server to process these requests, we must fetch these resources on the front end. To do this we need to enable CORS, which is most easily done with a browser extension like 'Test CORS' for Chrome. Otherwise you will see blocked requests logging errors in the console. This can also be avoided by using the demo's `fetchEmbed` stub in `demo/utils/fetchEmbed.ts`, which returns fixed test data instead of fetching.

## Additional notes

### Project structure

This repo contains a single package, **`@inkling/editor`**, at the repository root.

**`/src`**

The main module source. `/src/index.ts` is the entry point for the exposed module and should export everything needed to use the module from an external app.

**`/demo`**

Used for developing/demoing the editor. Renders the showcase document with all features enabled (see "Standalone mode").

### Styling

**CSS**

Styling should be done using Tailwind classes where possible.

All editor styles are scoped under the `.inkling-lexical` class to avoid clashes and keep styling as isolated as possible. CSS nesting is supported throughout (Tailwind CSS v4 compiles it).

- Styles located in `src/styles/` are included in the final built module.
- Styles located in `demo/*.css` are only used in the demo and will not be included in the built module.

The build emits the stylesheet as a separate artifact — `dist/style.css`, published under the `@inkling/editor/style.css` export subpath (`@inkling/editor/core.css` for the `./core` entry):

```tsx
import '@inkling/editor/style.css'
```

The UMD artifact additionally injects the same styles at runtime, so direct-browser consumers need no CSS import. Theme token defaults are scoped to `.inkling-lexical` — the sheet never claims the host page's `:root`. The overridable variables and the dark-mode contract are documented in `docs/theming.md`.

**SVGs**

SVGs can be imported as React components in the [same way as create-react-app](https://create-react-app.dev/docs/adding-images-fonts-and-files/#adding-svgs). Typically files are stored in `src/assets/`.

All imported files are processed/optimised via SVGO (see `svgo.config.js` for optimisation config) and included in the built JS file.

## Testing

We use [Vitest](https://vitest.dev) for unit tests and [Playwright](https://playwright.dev) for e2e testing.

- `pnpm test` runs unit tests and exits
- `pnpm test:e2e` runs end-to-end tests and exits
- `pnpm test:unit` runs unit tests
- `pnpm typecheck` runs strict semantic TypeScript checks for production/demo/scripts, Vitest unit/utils suites, and Playwright e2e suites
- `pnpm typecheck:unit` runs the dedicated strict check for `test/unit/**` and `test/utils/**`
- `pnpm typecheck:e2e` runs the dedicated strict semantic check for `test/e2e/**` and `test/utils/e2e.ts`
- `pnpm test:unit:watch` runs unit tests and starts a test watcher that re-runs tests on file changes
- `pnpm test:unit:watch --ui` runs unit tests and opens a browser UI for exploring and re-running tests
- `pnpm test:e2e` runs e2e tests
- `pnpm test:e2e --headed` runs tests in browser so you can watch the tests execute
- `pnpm test:slowmo` same as `pnpm test:e2e --headed` but adds 100ms delay between instructions to make it easier to see what's happening (note that some tests may fail or timeout due to the added delays)
- `pnpm test:e2e --ui` opens a [browser UI](https://playwright.dev/docs/test-ui-mode) in watch mode for exploring and re-running tests
- `pnpm test:e2e --ui --headed` same as `pnpm test:e2e --ui` but also runs tests in browser so you can watch the tests execute

Playwright specs under `test/e2e/**` and their Playwright-only `test/utils/e2e.ts` helper have two separate gates.
`pnpm typecheck:e2e` uses `tsc` for strict semantic checking and is composed into the canonical `pnpm typecheck` command.
`pnpm test:e2e` separately transforms and executes the browser suite with Playwright; transformation and execution are not
a substitute for TypeScript semantic analysis. The dedicated config keeps Playwright ambient types and browser scaffolding
out of the production and Vitest TypeScript programs, while the unchanged CI static and e2e jobs reach both guarantees.

Before tests are started we build a version of the demo app that is used for the unit tests.

When developing it can be useful to limit unit tests to specific keywords (taken from `describe` or `it/test` names). That's possible using the `-t` param and works with any of the above test commands, e.g.:

- `pnpm test:unit:watch -t "buildCardMenu"`

### How to debug e2e tests on CI

You can download the report in case of tests were failed. It can be found in the actions `Summary` in the `Artifacts` section.
To check traces, run command `npx playwright show-trace trace.zip`.
More information about traces can be found here https://playwright.dev/docs/trace-viewer

### ESM in e2e tests

Node enables ECMAScript modules if `type: 'module'` in package.json file. It leads to some restrictions:

- [No require, exports, module.exports, **filename, **dirname](https://github.com/GrosSacASac/node/blob/master/doc/api/esm.md#no-require-exports-moduleexports-__filename-__dirname)
- [Mandatory file extensions](https://github.com/GrosSacASac/node/blob/master/doc/api/esm.md#mandatory-file-extensions)
- [No require.extensions](https://github.com/GrosSacASac/node/blob/master/doc/api/esm.md#no-requireextensions). It means we don't have control over the extensions list. Further will be a description of why this is important.

We can make file extension optional with [--experimental-specifier-resolution](https://nodejs.org/api/cli.html#--experimental-specifier-resolutionmode)
flag, which we use. But node is not recognized `jsx` extension.
It can be solved with [node loaders](https://github.com/nodejs/loaders-test/tree/main/commonjs-extension-resolution-loader), whereas
as they're still in [experimental mode](https://nodejs.org/api/esm.html#esm_experimental_loaders), there is no appropriate
implementation for this use case.
The same issue was raised in the babel repo, but the loader won't be added while node loaders are
in [experimental mode](https://github.com/babel/babel/issues/11934).

We can add our loader implementation to solve the issue. Still, in reality, we shouldn't need real
JSX components in e2e tests. It can be a situation when some constants locate in the `jsx` file. In this case,
we can move them to js file. If it is a problem in the future, we can add our implementation of the loader or
add an extension to all imports in the project.

### Editor integration

There's a [vitest vscode extension](https://marketplace.visualstudio.com/items?itemName=ZixuanChen.vitest-explorer) that
lets you run and debug individual unit tests/groups directly inside vscode.

## Deployment

The `@inkling/editor` package is built from this repository. Run `pnpm build` to produce the distributable files (`dist/editor.js` for ESM, `dist/editor.umd.cjs` for CommonJS, plus the legacy `dist/editor.umd.js` copy) and `pnpm pack` to preview the package contents. `pnpm verify:package` packs the tarball and loads both entry conditions in clean consumers with only `react`/`react-dom` installed — it is the release gate for the install contract documented above.
