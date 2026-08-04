# UI conventions

`packages/ui/src/` contains pure-props React components: explicit props only, no reads from sessions, route
params, request objects, or env vars. State lives at the route module or the closest interactive
parent.

## Component tiers

- **`ui/components/`** — shadcn/ui primitives (Base UI variant), flat so `npx shadcn@latest add/diff`
  works. `components.json` aliases `components` and `ui` here. One token cascade in `:root`
  (`tailwind.css`) covers public + admin.
- **`ui/public/`** — `chrome/`, `post/`, `comments/` (thread state split across four contexts in
  `comments-context.ts` — Tree / Identity / ReplySlot / Actions — so leaf rows subscribe to slices),
  `friends/`, `widgets/`, plus single-file leaves (`Search`, `Sidebar`, `LikeActions`).
- **`ui/admin/`** — grouped by domain (`analytics`, `apikeys`, `audit`, `auth`, `categories`, `comments`, `dashboard`, `editor-pickers`, `editor-shell`, `editor-shared`, `fonts`, `friends`, `images`, `library`, `musics`, `my`, `pages`, `posts`, `sessions`, `settings`, `tags`, `users`, `webmentions`, `welcome`, plus `shared/` and `shell/`).
  - `fonts/` — `FontsView.tsx` (shell, ≤500 LOC), `FontUploadButton.tsx` (upload dialog FSM on
    `useFileUpload`), `font-slots.ts` (`slotsReducer` + `useFontSlotsController`, in-flight reseed
    guard), `dnd.ts` (drag guards).
  - `shared/` — cross-domain modules (`useAdminInfiniteList`, `filterPillsReducer`, `sortable.tsx`
    …). `sortable.tsx` is the one dnd-list adapter: `useSortableSensors`, `useSortableRow`
    (destructure its result — member access trips the react-compiler ref heuristic),
    `SortableDragHandle`, `resolveSortableMove`. New sortable lists use it, don't copy row chrome.
  - `editor-pickers/` — editor-insertion picker dialogs: `ImageLibraryPicker.tsx` (library image
    picker for body images) and `MusicPickerDialog.tsx` (music picker for the MusicPlayer block).
  - `editor-shell/` — orchestration layer wrapping the Lexical editor into a draft/publish workflow:
    `useEditorShellState` (shared FSM for Post + Page shells — drafts, conflict resolution,
    autosave, revision-token race, persist save/publish/unpublish, shortcuts, layout toggles),
    `EditorScreen` (single screen driven by an `EditorScreenAdapter`), `makeEditorAdapter`
    (factory: per-entity config + per-render runtime → adapter), plus `DraftConflictDialog`,
    `FloatingPublishButton`, `PreviewPanel`, `RevisionsDrawer`, `DateTimePicker`. The
    `Post/PageEditorShell.tsx` pair (under `posts/` / `pages/`) are thin config-only call sites;
    `Post/PageEditorRoute.tsx` delegate the query → error → skeleton → shell flow to
    `editor-shared/EditorRouteLoader`. No new shared state belongs in either Shell — extend
    `useEditorShellState` instead.

## Cross-cutting UI modules

- Body renderers live in `@kobato/editor` (not `ui/`): `editor/src/renderer/` holds the shared
  block components + contexts (`blocks/` — CodeBlock, BlockImage, MusicPlayer, Solution, Friends —
  `Footnotes.tsx`, `image-meta-context.tsx`, `render-marks.tsx`
  (`renderMathMarkupOrTexFallback`), `render-shared.ts` (`MusicPresentationContext`)); the Lexical
  React renderers are `editor/src/lexical-html/` (`LexicalBody`, `LexicalCommentBody`).
- `ui/icons/` — static-export icon library. Named imports only — no `<Icon name="..." />` string
  lookups. Import directly from `lucide-react`; the build tree-shakes unused icons.
- `ui/lib/` — UI utilities (`cn`, `code-languages`, `ThemeProvider`,
  `use-media-query`). shadcn's `aliases.lib` is pinned here. No `apps/core/src/lib/` parallel.

## Tailwind-merge tokens

`cn.ts` extends `tailwind-merge` with every project token namespace so custom `--text-*`,
`--color-*`, `--shadow-*` tokens land in the correct merge group — otherwise
`cn('text-toc-toggle text-ink-3')` collapses to `'text-ink-3'` (both look like opaque `text-*`).

### Token system

`tailwind.css` layers tokens in three tiers, one-way dataflow bottom-up:

1. **Raw brand tokens** — in `:root`, re-bound in `.dark { … }`. The only place hex values live:
   `--brand`, `--ink-1`, `--surface-body`, `--line-muted`, `--chip-bg`.
2. **shadcn slot aliases** — in `:root`, mapped onto the raw layer by name so shadcn primitives work
   unmodified: `--background` ← `--surface-body`, `--foreground` ← `--ink-1`, `--card` / `--popover`
   ← `--canvas`, `--muted` / `--secondary` ← `--surface-dim`, `--accent` / `--border` ← `--line`,
   `--input` ← `--line-widget`, `--ring` ← `--brand`.
3. **`@theme inline` bridge** — the same names with a `--color-` (or `--shadow-`, `--text-`, …)
   prefix so Tailwind v4 emits utilities. `cn.ts` mirrors that prefix-stripped list. `inline` keeps
   tokens reactive to `.dark` rebinds in tier 1.

Shadow tokens can't be re-bound directly in `.dark { }` (registered `@theme inline` tokens are
immutable), hence the `*-value` indirection: `.dark` rewrites `--shadow-card-value` and the bridge
alias `--shadow-card = var(--shadow-card-value)` passes it through.

### Adding a new theme-aware utility

1. Define the raw token in `:root` AND `.dark { }` (`tailwind.css`).
2. Bridge it in `@theme inline { --color-foo: var(--foo) }`.
3. Add `'foo'` to the matching list in `cn.ts`.
4. Consume as `bg-foo` / `text-foo` / … in TSX.

Do NOT write `dark:bg-foo` on a tier-1 token — the `.dark { }` rebind already handles theme
switching; the `dark:` prefix is a no-op double declaration.

### Dark surface lightness ladder

Adjacent tiers carry 3–8 L of perceptible separation; no `--line-*` token shares a value with any
`--surface-*` token:

| Token        | Hex       | L   | Usage                            |
| ------------ | --------- | --- | -------------------------------- |
| secondary    | `#0b1322` | 7   | image dimmer overlays only       |
| aside-bg     | `#15203a` | 14  | recessed sidebar                 |
| body         | `#1d2842` | 17  | page floor, cards rest here      |
| canvas       | `#26314d` | 21  | card, popover, primary elevated  |
| surface      | `#26314d` | 21  | sibling of canvas                |
| surface-soft | `#2a3553` | 23  | soft chip / hover-state fill     |
| surface-dim  | `#303a5a` | 26  | muted / secondary fill, input bg |
| line-muted   | `#374566` | 30  | recessed divider                 |
| line         | `#475672` | 38  | default border                   |
| line-widget  | `#5b6b88` | 44  | strong border (input emphasis)   |

The line trio must stay out of the surface band: when `--line` equaled `--surface-soft`, every
`border-line` consumer vanished on the soft surface and `--accent` (→ `--line`) lost its hover
state.

## Component & styling rules

- Plain TSX with explicit props. No hidden reads from route params, sessions, request objects, or
  env vars.
- Compose with children and slots, not boolean prop matrices (`architecture-avoid-boolean-props`).
  Prefer compound components over render-prop callbacks. Recursive components recurse by name.
- React 19: no `forwardRef` for new components — refs flow through props.
- Raw HTML uses `dangerouslySetInnerHTML` on the host element — no generic `Html` wrapper.
- Conditional classNames go through `cn()` from `@kobato/ui/lib/cn`. A new `--<namespace>-<name>` token in
  `tailwind.css` MUST pair with an entry in `cn.ts`'s per-namespace list — enforced by
  `packages/ui/tests/unit/contract/tailwind-tokens.test.ts`.
- Use `<Image />` from `@kobato/ui/public/widgets/Image` for transformed remote images.

## Shiki syntax highlighting

- **Shiki is SSR-only.** Never import `shiki`, `@shikijs/langs`, or `@shikijs/themes` in `packages/ui/src/` —
  Shiki's Oniguruma `.wasm` violates the strict `script-src` CSP in the browser.
- A UI component needing highlighted code gets pre-rendered HTML from the server procedure or loader
  in the DTO (e.g. `detailsHtml` on audit-log items). Render it with `dangerouslySetInnerHTML`
  through `sanitizeHtml(html, 'shiki')` from `@kobato/ui/lib/sanitize-html` so inline `style` attributes
  and shiki CSS classes survive while everything else is stripped.

## LOC ceiling

Stateful orchestrators (editor shells, multi-stage forms, comment threads, Lexical renderers)
aim for ≤500 LOC per file. Past that, extract shared state into a hook, sub-components into
siblings, or per-renderer modules — another agent should read the file without scrolling past
unrelated concerns.

## Body editor (Lexical)

- Dialect: `@kobato/shared/lexical/schema` (`LexicalBody`, `lexicalBodySchema`) — text / heading /
  quote / list + custom nodes `image`, `code`, `mathBlock`, `horizontalrule`, `musicPlayer`,
  `solution`, `footnoteDefinition`, `twoColumn`, `table`. The friends grid is NOT a body block —
  it's the `page.show_friends` toggle.
- Editor engine: `@kobato/editor/engine/lexical/` (`LexicalBodyEditor`), pinned to
  `lexical@0.45.0`. The retired PT/Tiptap track (`@tiptap/*`, `@portabletext/*`) is gone; the
  one-way PT→Lexical conversion (`@kobato/shared/lexical/mapping::convertPtBodyToLexical` —
  moved out of `editor/lexical-core` in stage 5) and the PT schema survive only as
  `@kobato/shared/legacy-pt/*` for the data-migration window
  (`kobato migrate-pt` — `packages/server/src/infra/pt-migration/`, dual-shape read).
  The custom decorator nodes live in `@kobato/shared/lexical/nodes/*`; their React views live
  in `@kobato/editor/engine/lexical/node-views/` and are wired via the shared node-view
  registry (`@kobato/shared/lexical/node-views`, `register-node-views.tsx`).
- SSR renderers: `@kobato/editor/lexical-html/` (`LexicalBody`, `LexicalCommentBody`; server-side
  string form via `@kobato/server/render/lexical-html/lexicalBodyToHtml` and
  `…/comment-to-html` — moved to the server package in stage 4, with the
  shared manifest contract in `@kobato/shared/lexical/html-manifest`). Heading anchor ids align with
  post anchors.
- Admin editor: `@kobato/editor/engine/lexical/LexicalBodyEditor` (shared by pages and posts). UX:
  toolbar (`LexicalToolbar`, `engine/lexical/toolbar/`) → floating bubble menus
  (`engine/lexical/bubble-menus.tsx`: B/I/U + code + link + `mathInline`/`footnoteRef`) →
  slash menu (`engine/lexical/slash-commands.ts` + `slash-menu.tsx`).
- **Table dialect**: cells are inline-only — no nested blocks, lists, code blocks, math blocks, or
  footnote refs. Slash-menu / toolbar inserts a 3×3 table with a header row.
- Floating popups anchor with `position: fixed` off Lexical's `getDOMRangeFromSelection`. Do
  **not** add `@floating-ui/*` directly — `@base-ui/react` pulls it in transitively.

## Page draft preview

`PageDetailBody` accepts a `draftMarker` prop:
`'draft' | 'unpublished-draft' | 'published-draft' | null`.

- **【草稿】** — catalog miss, admin sees latest draft.
- **【未发布的草稿】** — catalog hit + `?draft=true`, newer draft exists.
- **【已发布的草稿】** — catalog hit + `?draft=true`, latest revision IS the published one.

## Page meta toggles

- `page` carries operator-facing booleans (`comments_enabled`, `show_toc`, `show_friends`) edited
  from `MetaSidebar` and consumed by `routes/public/page/detail.tsx` as render-time branches —
  never body mutations. `show_friends` appends the global friends grid below the body before the
  Like button; the body dialect has no `friends` block.
- Adding a toggle touches: db schema + migration + snapshot, page projection, page service +
  schema, shared DTOs, `MetaSidebar` + `PageEditorShell`, and the `PageMetaDraft` meta type in
  `@kobato/shared/types/pages` (passed through to `@kobato/client/hooks/use-create-draft` by the editor shell).
  Test fixtures in `#/_helpers/catalog` and the page service tests under
  `packages/server/tests/it/domains/pages/` need the new default.
