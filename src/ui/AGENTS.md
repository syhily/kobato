# UI conventions

`src/ui/` contains pure-props React components: explicit props only, no reads from sessions, route
params, request objects, or env vars. State lives at the route module or the closest interactive
parent.

## Component tiers

- **`ui/components/`** — shadcn/ui primitives (Base UI variant), flat so `npx shadcn@latest add/diff`
  works. `components.json` aliases `components` and `ui` here. One token cascade in `:root`
  (`tailwind.css`) covers public + admin.
- **`ui/public/`** — `chrome/`, `post/`, `comments/` (thread state split across four contexts in
  `comments-context.ts` — Tree / Identity / ReplySlot / Actions — so leaf rows subscribe to slices),
  `friends/`, `widgets/`, `aplayer/`, plus single-file leaves (`Search`, `Sidebar`, `LikeActions`).
- **`ui/admin/`** — grouped by domain (`analytics`, `auth`, `categories`, `comments`, `editor`,
  `editor-shell`, `editor-shared`, `fonts`, `friends`, `images`, `library`, `musics`, `my`, `pages`,
  `posts`, `sessions`, `settings`, `tags`, `users`, `dashboard`, plus `shared/` and `shell/`).
  - `fonts/` — `FontsView.tsx` (shell, ≤500 LOC), `FontUploadButton.tsx` (upload dialog FSM on
    `useFileUpload`), `font-slots.ts` (`slotsReducer` + `useFontSlotsController`, in-flight reseed
    guard), `dnd.ts` (drag guards).
  - `shared/` — cross-domain modules (`useAdminInfiniteList`, `filterPillsReducer`, `sortable.tsx`
    …). `sortable.tsx` is the one dnd-list adapter: `useSortableSensors`, `useSortableRow`
    (destructure its result — member access trips the react-compiler ref heuristic),
    `SortableDragHandle`, `resolveSortableMove`. New sortable lists use it, don't copy row chrome.
  - `editor/` — the page/post body editor: `PageBodyEditor` (the inkling composer wrapper + host
    glue; the only module other admin domains import), `pickers/` (image-library / music dialogs),
    and `lexical-body-diff.tsx` (revision diff). `editor/tiptap/` now serves ONLY the comment
    editor (`BlockCardNode`, `InlineMarks`, `SlashMenu` + `slash-commands`, `block-cards/`
    Math/Music, `use-admin-math-preview`) — the main body editor no longer uses Tiptap.
  - `editor-shell/` — orchestration layer wrapping the inkling body editor into a draft/publish
    workflow: `useEditorShellState` (orchestrator for Post + Page shells — body/meta drafts,
    shortcuts, meta-panel toggle), `useEditorShellPersist` (deep persist module: owns the
    revision-token race, both autosave freeze legs, the local-draft conflict, and the persisted
    baseline; wire/status decisions are pure planners in `editor-shell-persist-plan.ts`),
    `useAutosave` (client-side engine — sole baseline owner behind `setBaseline`, mount seed via
    `initialBaseline`), `EditorScreen` (single screen driven by an `EditorScreenAdapter`),
    `makeEditorAdapter` (factory: per-entity config + per-render runtime → adapter), plus
    `DraftConflictDialog`, `RevisionsDrawer`, `DateTimePicker`. The `Post/PageEditorShell.tsx`
    pair (under `posts/` / `pages/`) are thin config-only call sites; `Post/PageEditorRoute.tsx`
    delegate the query → error → skeleton → shell flow to `editor-shared/EditorRouteLoader`. No
    new shared state belongs in either Shell — extend `useEditorShellState` instead.

## Cross-cutting UI modules

- `ui/pt/` — PortableText SSR renderer: `render.tsx` (entry, components map, recursive blocks,
  FootnotesSection), `render-blocks.tsx` (block renderers + table inline-span helpers),
  `render-marks.tsx` (mark renderers + `renderMathMarkupOrTexFallback`), `render-shared.ts`
  (PT_INLINE tokens + React contexts), plus `Footnotes.tsx`, `image-meta-context.tsx`, and custom
  blocks under `ui/pt/blocks/` (CodeBlock, BlockImage, MusicPlayer, Solution, Friends).
- `ui/icons/` — static-export icon library. Named imports only — no `<Icon name="..." />` string
  lookups. Import directly from `lucide-react`; the build tree-shakes unused icons.
- `ui/lib/` — UI utilities (`cn`, `code-languages`, `ThemeProvider`,
  `use-media-query`). shadcn's `aliases.lib` is pinned here. No `src/lib/` parallel.

## Merge-engine tokens

`cn.ts` builds the project-wide `cn()` with the [`cn`](https://github.com/shadcn-ui/cn) package's
`createCn` (`cn/config`), extending every project token namespace so custom `--text-*`,
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
- Conditional classNames go through `cn()` from `@/ui/lib/cn`. A new `--<namespace>-<name>` token in
  `tailwind.css` MUST pair with an entry in `cn.ts`'s per-namespace list — enforced by
  `tests/unit/contract/tailwind-tokens.test.ts`.
- Use `<Image />` from `@/ui/public/widgets/Image` for transformed remote images.

## Shiki syntax highlighting

- **Shiki is SSR-only.** Never import `shiki`, `@shikijs/langs`, or `@shikijs/themes` in `src/ui/` —
  Shiki's Oniguruma `.wasm` violates the strict `script-src` CSP in the browser.
- A UI component needing highlighted code gets pre-rendered HTML from the server procedure or loader
  in the DTO (e.g. `detailsHtml` on audit-log items). Render it with `dangerouslySetInnerHTML`
  through `sanitizeHtml(html, 'shiki')` from `@/ui/lib/sanitize-html` so inline `style` attributes
  and shiki CSS classes survive while everything else is stripped.

## LOC ceiling

Stateful orchestrators (editor shells, multi-stage forms, comment threads, PortableText renderers)
aim for ≤500 LOC per file. Past that, extract shared state into a hook, sub-components into
siblings, or per-renderer modules — another agent should read the file without scrolling past
unrelated concerns.

## Content editors

- Zod dialect: `@/shared/pt/schema` (text / list / heading / blockquote + custom blocks `image`,
  `code`, `mathBlock`, `horizontalRule`, `musicPlayer`, `solution`, `footnoteDefinition`, `table`).
  The friends grid is NOT a body block — it's the `page.show_friends` toggle.
- Server-only PT helpers in `@/server/domains/pt/*` (prerender, canonicalize) must never reach the
  client bundle.
- PT ↔ ProseMirror bridge: `@/shared/pt/bridge/` — per-concern modules (`pt-to-pm.ts`,
  `pm-to-pt.ts`, `node-registry.ts`, `types.ts`, `utils.ts`, `canonicalize.ts`, per-node modules
  under `nodes/`). Custom blocks ride a generic `blockCard` PM node. Round-trip contract-tested in
  `tests/unit/shared/pt/bridge/`. Only the comment editor still crosses this bridge.
- SSR renderer: `@/ui/pt/render` (`PortableTextBody`), composing `@portabletext/react` with
  `@/ui/pt/blocks/*`. Heading anchor ids align with post anchors.
- Admin body editor: `@/ui/admin/editor/PageBodyEditor` (shared by pages and posts) wraps the
  inkling composer (`@inkling/editor` — the workspace package in `packages/inkling/`). The
  composer surface (floating format toolbar, slash menu, drag reorder, card chrome) comes from the
  package; the kobato glue (host cards, `KobatoImageNode`, upload/picker wiring, zh-CN labels)
  lives in `@/client/editor/` (see `src/client/AGENTS.md`). Kobato inserts reach the composer
  through `INSERT_CARD_COMMAND`; host styling hooks are scoped under `.kobato-page-editor` in
  `src/styles/inkling-editor.css`.
- Comment editor (still Tiptap v3 — R12 scope): `@/ui/public/comments/CommentBodyEditor` on the PT
  bridge (`bodyToPmDoc` / `pmDocToBody`) with the shared `editor/tiptap/` building blocks. The
  slash catalogue is `SLASH_COMMANDS` in `tiptap/slash-commands.ts` — which also owns the
  `editor.storage.editorActions` Storage augmentation pickers fire through — overridden per
  surface (`COMMENT_SLASH_COMMANDS`).
- **Tiptap v3 never re-renders on transactions** (comment editor). `useEditor` only re-renders on
  React-driven updates, so any UI that tracks the document or selection (mark activeness, command
  availability) MUST subscribe via `useEditorState({ editor, selector })` —
  `comments/CommentEditorToolbar` is the reference.
- Floating popups (the comment SlashMenu) anchor with `position: fixed` off the suggestion
  plugin's `clientRect`. Do **not** add `@floating-ui/*` directly — `@base-ui/react` pulls it in
  transitively.

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
  Like button; PortableText has no `friends` block.
- Adding a toggle touches: db schema + migration + snapshot, page projection, page service +
  schema, shared DTOs, `MetaSidebar` + `PageEditorShell`, and the `PageMetaDraft` meta type in
  `@/shared/types/pages` (passed through to `@/client/hooks/use-create-draft` by the editor shell).
  Test fixtures in `tests/_helpers/catalog.ts` and the page service tests under
  `tests/it/server/domains/pages/` need the new default.
