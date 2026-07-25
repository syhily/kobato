# UI conventions

`src/ui/` contains pure-props React components. Components receive
explicit props. No reads from sessions, route params, request objects,
or env vars. State lives at the route module or the closest interactive
parent.

## Component tiers

- **`ui/components/`** — shadcn/ui primitives (Base UI variant), flat
  so `npx shadcn@latest add/diff` works. `components.json` aliases
  `components` and `ui` here. One token cascade in `:root`
  (`tailwind.css`) covers public + admin.
- **`ui/public/`** — `chrome/`, `post/`, `comments/` (thread state
  split across four contexts in `comments-context.ts` — Tree /
  Identity / ReplySlot / Actions — so leaf rows subscribe to slices
  instead of one mega-context), `friends/`
  (friend-link application form), `widgets/`, `aplayer/`, plus
  single-file leaves (`Search.tsx`, `Sidebar.tsx`, `LikeActions.tsx`).
- **`ui/admin/`** — grouped by domain (`analytics`, `auth`,
  `categories`, `comments`, `editor`, `editor-shell`, `fonts`,
  `friends`, `images`, `library`, `musics`, `my`, `pages`, `posts`,
  `sessions`, `settings`, `tags`, `users`, `dashboard`, plus `shared/`
  and `shell/`).
  - `fonts/` — the font library view split into focused modules:
    `FontsView.tsx` (shell, ≤500 LOC), `FontUploadButton.tsx`
    (upload-phase dialog FSM on `useFileUpload`), `font-slots.ts`
    (exported `slotsReducer` + `useFontSlotsController` with the
    in-flight reseed guard), `dnd.ts` (fonts drag protocol guards).
  - `shared/` — cross-domain admin modules (`useAdminInfiniteList`,
    `filterPillsReducer`, `sortable.tsx` …). `sortable.tsx` is the one
    dnd-list adapter: `useSortableSensors`, `useSortableRow` (destructure
    its result — member access trips the react-compiler ref heuristic),
    `SortableDragHandle`, `resolveSortableMove`. New sortable lists use
    it instead of copying row chrome.
  - `editor/` — the Tiptap micro-app (`PageBodyEditor`, `tiptap/`,
    `toolbar/`, `pickers/`, `FootnoteEditorDialog`,
    `portable-text-diff`). Self-contained; only `PageBodyEditor` is
    imported by other admin domains.
  - `editor-shell/` — the business-orchestration layer that wraps the
    Tiptap editor into a draft/publish workflow:
    `useEditorShellState` (shared FSM for both Post + Page editor
    shells — body/meta drafts, draft-conflict resolution, autosave,
    revision-token race, persist save/publish/unpublish, keyboard
    shortcuts, layout toggles), `EditorScreen` (the single screen both
    entities render, driven by an `EditorScreenAdapter`),
    `makeEditorAdapter` (factory that turns a static per-entity
    config — nouns, paths, draft configs, oRPC namespace, unwrap key —
    plus per-render runtime into that adapter), `DraftConflictDialog`,
    `FloatingPublishButton`, `PreviewPanel`, `RevisionsDrawer`,
    `DateTimePicker`. `PostEditorShell.tsx` and `PageEditorShell.tsx`
    (under `posts/` / `pages/`) are thin config-only call sites of the
    factory encoding only entity-specific bindings (DTO key shape, API
    endpoint paths, sidebar component, mutation payload fields, UI
    text); `PostEditorRoute.tsx` / `PageEditorRoute.tsx` delegate the
    query → error → skeleton → shell flow to
    `editor-shared/EditorRouteLoader`. No new shared state belongs in
    either Shell — extend `useEditorShellState` instead.

## Cross-cutting UI modules

- `ui/pt/` — PortableText SSR renderer split across `render.tsx`
  (entry, components map, recursive blocks, FootnotesSection),
  `render-blocks.tsx` (12 block renderers + table inline-span
  helpers), `render-marks.tsx` (3 mark renderers +
  `renderMathMarkupOrTexFallback`), `render-shared.ts` (PT_INLINE
  class tokens + 4 React contexts). Plus `Footnotes.tsx`,
  `image-meta-context.tsx`, and custom-block components under
  `ui/pt/blocks/` (CodeBlock, BlockImage, MusicPlayer, Solution,
  Friends).
- `ui/icons/` — Static-export icon library. Named imports only — no
  `<Icon name="..." />` string lookups. Import icons directly from
  `lucide-react`; the build tree-shakes unused icons.
- `ui/lib/` — UI utilities (`cn`, `code-languages`, `ThemeProvider`,
  `blog-config-context`, `use-media-query`). shadcn's `aliases.lib` is
  pinned here. No `src/lib/` parallel.

## Tailwind-merge tokens

`cn.ts` extends `tailwind-merge` with every project token namespace so
custom `--text-*`, `--color-*`, `--shadow-*` tokens are classified into
the correct merge group — otherwise `cn('text-toc-toggle text-ink-3')`
collapses to `'text-ink-3'` because tailwind-merge sees both as opaque
`text-*` utilities.

### Token system

`tailwind.css` layers tokens in three tiers, with one-way dataflow from
the bottom up:

1. **Raw brand tokens** — declared in `:root` and re-bound in
   `.dark { … }`. The only place a hex value lives: `--brand`,
   `--ink-1`, `--surface-body`, `--line-muted`, `--chip-bg`.
2. **shadcn slot aliases** — also in `:root`, mapped onto the raw layer
   by name so the shadcn primitives keep working unmodified:
   `--background` ← `--surface-body`, `--foreground` ← `--ink-1`,
   `--card` / `--popover` ← `--canvas`, `--muted` / `--secondary` ←
   `--surface-dim`, `--accent` ← `--line`, `--border` ← `--line`,
   `--input` ← `--line-widget`, `--ring` ← `--brand`.
3. **`@theme inline` bridge** — the same names with a `--color-` (or
   `--shadow-`, `--text-`, …) prefix so Tailwind v4 emits utilities for
   them. `cn.ts` mirrors that prefix-stripped list. `inline` keeps the
   tokens reactive to `.dark` rebinds in tier 1.

Shadow tokens cannot be re-bound directly in `.dark { }` because
`@theme inline` tokens are immutable once registered. Hence the
`*-value` indirection: `.dark` rewrites `--shadow-card-value`, and the
bridge alias `--shadow-card = var(--shadow-card-value)` passes the new
value through.

### Practical rule for adding a new theme-aware utility

1. Define raw token in `:root` AND in `.dark { }` (`tailwind.css`).
2. Bridge it in `@theme inline { --color-foo: var(--foo) }`.
3. Add `'foo'` to the matching list in `cn.ts`.
4. Consume as `bg-foo` / `text-foo` / … in TSX.

Do NOT write `dark:bg-foo` on a token that lives in tier 1 — the
`.dark { }` rebind already handles theme switching, so the `dark:`
prefix is a no-op double declaration.

### Dark surface lightness ladder

Every adjacent tier carries 3 to 8 L of perceptible separation, and no
`--line-*` token shares a value with any `--surface-*` token:

| Token        | Hex       | L   | Usage                             |
| ------------ | --------- | --- | --------------------------------- |
| secondary    | `#0b1322` | 7   | image dimmer overlays only        |
| aside-bg     | `#15203a` | 14  | recessed sidebar                  |
| body         | `#1d2842` | 17  | page floor, cards rest here       |
| canvas       | `#26314d` | 21  | card, popover, primary elevated   |
| surface      | `#26314d` | 21  | sibling of canvas                 |
| surface-soft | `#2a3553` | 23  | soft chip / hover-state fill      |
| surface-dim  | `#303a5a` | 26  | muted / secondary fill, input bg  |
| line-muted   | `#374566` | 30  | recessed divider                  |
| line         | `#475672` | 38  | default border (cards, inputs, …) |
| line-widget  | `#5b6b88` | 44  | strong border (input emphasis)    |

The line trio must stay out of the surface band: when `--line` equaled
`--surface-soft`, every `border-line` consumer vanished on top of the
soft surface and `--accent` (which resolves to `--line`) lost its
perceptible hover state.

## Component rules

- Plain TSX with explicit props. No hidden reads from route params,
  sessions, request objects, or env vars.
- Compose with children and slots, not boolean prop matrices
  (`architecture-avoid-boolean-props`).
- Prefer compound components over render-prop callbacks. Recursive
  components recurse by component name.
- React 19: no `forwardRef` for new components — refs flow through
  props.

## Styling rules

- Raw HTML uses `dangerouslySetInnerHTML` on the host element — no
  generic `Html` wrapper.
- Conditional classNames go through `cn()` from `@/ui/lib/cn`. Adding a
  new `--<namespace>-<name>` token in `tailwind.css` MUST be paired
  with an entry in `cn.ts`'s per-namespace list — enforced by
  `tests/contract.tailwind-tokens.test.ts`.
- Use `<Image />` from `@/ui/public/widgets/Image` for transformed
  remote images.

## Shiki syntax highlighting

- **Shiki is SSR-only.** Do not import `shiki`, `@shikijs/langs`, or
  `@shikijs/themes` in any `src/ui/` component. Shiki's Oniguruma engine
  loads a `.wasm` module that violates our strict `script-src` CSP when
  instantiated in the browser.
- When a UI component needs highlighted code, the server procedure or
  loader must pre-render the HTML and pass it in the DTO (e.g.
  `detailsHtml` on audit-log items).
- Render pre-highlighted HTML with `dangerouslySetInnerHTML` and run it
  through `sanitizeHtml(html, 'shiki')` from `@/ui/lib/sanitize-html` so
  inline `style` attributes and shiki CSS classes are preserved while
  everything else is stripped.

## LOC ceiling

Stateful orchestrators (editor shells, multi-stage forms, comment
threads, PortableText renderers) should aim for ≤500 LOC per file.
When a single file grows past that, extract: shared state into a hook,
reusable sub-components into siblings, or per-renderer modules. The
benchmark is "another agent can read and modify the file without
scrolling past unrelated concerns."

## PortableText editor

- Zod dialect: `@/shared/pt/schema` (text / list / heading / blockquote
  - custom blocks `image`, `code`, `mathBlock`,
    `horizontalRule`, `musicPlayer`, `solution`, `footnoteDefinition`,
    `table`). Friends grid is NOT a body block — it's the
    `page.show_friends` toggle.
- Server-only PT helpers in `@/server/domains/pt/*` (prerender,
  canonicalize) must never reach the client bundle.
- PT ↔ ProseMirror bridge is `@/shared/pt/bridge/` — a directory of
  per-concern modules (`pt-to-pm.ts`, `pm-to-pt.ts`, `node-registry.ts`,
  `types.ts`, `utils.ts`, `canonicalize.ts`, plus per-node modules under
  `nodes/`). Custom blocks ride a generic `blockCard` PM node.
  Round-trip is contract-tested in `tests/unit/shared/pt/bridge/`
  (`types.test.ts`, `node-registry.test.ts`, `utils.test.ts`, and the
  `nodes/` cases).
- SSR renderer is `@/ui/pt/render` (`PortableTextBody`), composing
  `@portabletext/react` with `@/ui/pt/blocks/*`. Heading anchor ids
  align with post anchors.
- Admin editor is `@/ui/admin/editor/PageBodyEditor` (shared by pages
  and posts). UX: toolbar (image library / music picker / link / table
  / hr / undo-redo) → `tiptap/BubbleMenu` (text selection: B/I/U +
  code + link + `mathInline`/`footnoteRef`) and
  `tiptap/TableBubbleMenu` (table selection), mutually exclusive →
  `tiptap/SlashMenu` (`@tiptap/suggestion`, catalogue in
  `tiptap/slash-commands.ts`; pickers are invoked through
  `editor.storage.editorActions` — the `EditorActionsExtension` in
  `tiptap/editor-actions.ts`, populated from React via
  `editor-actions-setter.ts`).
- Image block uses a React NodeView (`tiptap/ImageNodeView`) for inline
  alt + caption edits.
- **Table dialect**: cells are inline-only — no nested blocks, lists,
  code blocks, math blocks, or footnote refs. Only `link` mark-defs.
  Slash-menu / toolbar inserts a 3×3 table with a header row.
- Floating popups anchor with `position: fixed` driven off the
  suggestion plugin's `clientRect` or Tiptap's `BubbleMenu` positioner.
  Do **not** add `@floating-ui/*` directly — `@base-ui/react` pulls it
  in transitively.

## Page draft preview

- `PageDetailBody` accepts a `draftMarker` prop:
  `'draft' | 'unpublished-draft' | 'published-draft' | null`.
- **【草稿】** — catalog miss, admin sees latest draft.
- **【未发布的草稿】** — catalog hit + `?draft=true`, newer draft exists.
- **【已发布的草稿】** — catalog hit + `?draft=true`, latest revision IS
  the published one.

## Page meta toggles

- `page` carries operator-facing booleans (`comments_enabled`,
  `show_toc`, `show_friends`) edited from `MetaSidebar` and consumed by
  `routes/public/page/detail.tsx` as render-time branches — never body
  mutations. `show_friends` appends the global friends grid below the
  body before the Like button; PortableText has no `friends` block.
- Adding a toggle touches: db schema + migration + snapshot, page
  projection, page service + schema, shared DTOs,
  `MetaSidebar` + `PageEditorShell`, and the `PageMetaDraft` meta type
  in `@/shared/types/pages` (passed through to
  `@/client/hooks/use-create-draft` by the editor shell). Test fixtures
  in `tests/_helpers/catalog.ts` + `tests/service.cms-pages*.test.ts`
  need the new default.
