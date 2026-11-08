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
  `friends/`, `widgets/`, `music-player/` (the MusicPlayerCard: cover + rAF-driven progress/volume
  scrub bars + synced LRC lyrics panel, hydrated onto `.aplayer[data-*]` mount points by
  `useMusicPlayers`), plus single-file leaves (`Search`, `Sidebar`, `LikeActions`).
- **`ui/shared/`** — feature components consumed by BOTH the public chrome and the admin shell
  (today: `notifications/` — the global right-side message drawer, opened from two entries: the
  admin sidebar's 「消息通知」nav item and the public user menu; `notification-meta.ts` owns the
  kind/source → icon mapping plus `kindLabelId` message ids and `formatNotificationTime`, which
  takes explicit `{ locale, timeZone, now }` — the consumer resolves the id with its own `t`).
  Anything only one side uses stays in its own tier.
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
    and `lexical-body-diff.tsx` (revision diff).
  - `editor-shell/` — orchestration layer wrapping the inkling body editor into a draft/publish
    workflow: `useEditorShellState` (orchestrator for Post + Page shells — body/meta drafts,
    shortcuts, meta-panel toggle), `useEditorShellPersist` (the persist orchestrator: owns the
    save-flow status + baselines, the autosave wiring, and the four persist handlers; the owned
    slices are sibling modules — `use-editor-shell-persist-race` (revision-token race + the
    `server` freeze leg), `use-editor-shell-persist-conflict` (local-draft session + conflict
    detection, the `local` freeze leg), `use-editor-shell-persist-mutations` (the four wire
    mutations — declaration order is test-pinned — and their note* interpreters); wire/status
    decisions are pure planners in `editor-shell-persist-plan.ts`),
    `useAutosave` (client-side engine — sole baseline owner behind `setBaseline`, mount seed via
    `initialBaseline`), `EditorScreen` (single screen driven by an `EditorScreenAdapter`),
    `makeEditorAdapter` (factory: per-entity config + per-render runtime → adapter), plus
    `DraftConflictDialog`, `RevisionsDrawer`, `DateTimePicker`. The `Post/PageEditorShell.tsx`
    pair (under `posts/` / `pages/`) are thin config-only call sites; `Post/PageEditorRoute.tsx`
    delegate the query → error → skeleton → shell flow to `editor-shared/EditorRouteLoader`. No
    new shared state belongs in either Shell — extend `useEditorShellState` instead.

## Cross-cutting UI modules

- `ui/public/post/` detail rendering — public post/page bodies render the saved `bodyHtml`
  projection: `DetailBodyChrome` sanitizes it with `sanitizeHtml(html, 'body')` into the
  `post-content` typeset container (`typeset typeset-post`), then five hydration hooks enhance the static markup on the
  client: `useMediumZoom` (`@/client/hooks/use-medium-zoom`) plus `useThumbhashHydration`,
  `useCodeCopyButtons`, `useMusicPlayers`, and `useFootnotePreviews` (the last four live beside
  the chrome). All five take the rendered `bodyHtml` as their re-scan key — the content div is
  reused across client-side navigations (only its innerHTML is swapped), so without the key the
  previous article's enhancements would leak on detached nodes (a music player's audio keeps
  playing) and the new article's markup would never upgrade. Comment bodies render the stored `content` HTML column through
  `comments/CommentContentHtml` with the narrower `'comment'` sanitize preset (the comment
  editor's node whitelist admits no media/headings — pinned by the sanitize strategy tests).
- `ui/icons/` — static-export icon library. Named imports only — no `<Icon name="..." />` string
  lookups. Import directly from `lucide-react`; the build tree-shakes unused icons.
- `ui/lib/` — UI utilities (`cn`, `code-languages`, `I18nProvider` (react-intl
  provider + typed `useI18n()`; messages arrive as root-loader data; `localizeMessage`
  formats only catalog ids through the same ICU engine and degrades a missing param /
  unformattable template to a generic localized sentence — logged, never a token name,
  raw template or id),
  `LocaleSyncProvider` (the ROOT cross-tab locale-sync loop mounted by `src/root.tsx`:
  subscribes once per document, publishes a committed locale with its bootstrap
  `revision` token, and applies a peer announcement according to the document's
  capability. A registered settings workspace runs its transaction — flush every
  dirty card then one automatic reload — and only a successful flush reloads. Every
  other document (editor, comment composer, setup, analytics, public) is NEVER
  reloaded automatically: it shows a localized `role="alert"` notice with an explicit
  Reload action so unsaved input survives. A failed flush offers Retry + Reload and
  consumes no revision token; the token is consumed only immediately before a reload
  attempt. Settings cards use `useLocaleSyncPublish`; `SettingsFlushProvider`
  registers the flush host),
  `ThemeProvider`,
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
- Interface copy is a UI message id resolved through `useI18n()` — including the accessible
  labels inside `ui/components/` primitives (`common.*` in the UI catalog). Any test that renders
  one of those primitives directly must mount `I18nProvider` (`#/_helpers/i18n-render`).
- Animation is Motion Only: JS-driven animation uses the `@/ui/components/lazy-motion` facade
  (`LazyMotion*` / `LazyAnimatePresence`) with shared constants from `@/client/lib/motion` — never
  React `<ViewTransition>` or `document.startViewTransition` (the root AGENTS.md defensive
  constraints carry the full rule; the ThemeProvider theme wipe is the one exception).
- Use `<Image />` from `@/ui/public/widgets/Image` for transformed remote images.

## Shiki syntax highlighting

- **Shiki is SSR-only.** Never import `shiki`, `@shikijs/langs`, or `@shikijs/themes` in `src/ui/` —
  Shiki's Oniguruma `.wasm` violates the strict `script-src` CSP in the browser.
- A UI component needing highlighted code gets pre-rendered HTML from the server procedure or loader
  in the DTO (e.g. `detailsHtml` on audit-log items). Render it with `dangerouslySetInnerHTML`
  through `sanitizeHtml(html, 'shiki')` from `@/shared/sanitize/sanitize-html` so inline `style` attributes
  and shiki CSS classes survive while everything else is stripped.

## LOC ceiling

Stateful orchestrators (editor shells, multi-stage forms, comment threads)
aim for ≤500 LOC per file. Past that, extract shared state into a hook, sub-components into
siblings, or per-renderer modules — another agent should read the file without scrolling past
unrelated concerns.

## Content editors

- Storage format: Lexical editor states (`@/shared/lexical/schema` for posts/pages,
  `@/shared/lexical/comment-schema` for comments). `@/shared/pt/schema` survives only for
  pre-Lexical legacy rows until the R15 backfill converts them. The friends grid is NOT a body block —
  it's the `page.show_friends` toggle.
- Server-only PT helpers (`@/shared/pt/utils` walkers, the R15 backfill converter) must never
  reach the client bundle; the dual-read helper in `comment-body-helpers.ts` is the one
  sanctioned client-side reader of legacy rows.
- Public SSR: bodies arrive as the saved `bodyHtml` projection (NULL falls back to an on-the-fly
  headless projection server-side — see `src/server/AGENTS.md` → Content) and render through
  `DetailBodyChrome` + the hydration hooks listed under Cross-cutting UI modules. Heading anchor
  ids come from the revision's `headings` projection column.
- Admin body editor: `@/ui/admin/editor/PageBodyEditor` (shared by pages and posts) wraps the
  inkling composer (the `@/inkling` barrel of the `src/inkling` editor layer) through the
  skeleton shared with the comment surface (`@/client/editor/editor-surface` — the
  registerAPI/body-reset wiring + the composer shell with labels/darkMode applied). The
  composer surface (floating format toolbar, slash menu, drag reorder, card chrome) comes from the
  layer; the kobato glue (host cards, `KobatoImageNode`, upload/picker wiring) lives in
  `@/client/editor/` (see `src/client/AGENTS.md`) — the active locale's Inkling label table arrives
  as root-loader data (`i18n.inklingLabels`), it is not imported by any UI module. Kobato inserts
  reach the composer
  through `INSERT_CARD_COMMAND`; host styling hooks are scoped under `.kobato-page-editor` in
  `src/styles/inkling-editor.css`.
- Editor copy is translated like the rest of the admin surface: every string lives in the
  `admin.editor.*` catalog namespace and is read through `useI18n()` (`t` / `tRich`). The entity
  noun ("post" / "page") never crosses a shared boundary as text — `makeEditorAdapter` configs and
  the `editor-shell`/`editor-shared` component props carry `entityLabelId` (`UiMessageId`, e.g.
  `admin.editor.entity.post`) and each site resolves it with `t(entityLabelId, { entity })` inside
  an ICU template. Inkling's host-card `menu[].label`/`desc` stay English fallbacks; the active
  locale's label table supplies the rendered text through `labelKey` (`menu.host.*`).
- Comment editor: `@/ui/public/comments/CommentBodyEditor` wraps the inkling composer with
  the trimmed comment node set. Every consumer mounts it through
  `@/ui/public/comments/LazyCommentBodyEditor` — the composer, the inkling island, and
  `inkling-comment-editor.css` ride a lazy chunk so the public post page's static import
  graph stays editor-free. The always-visible reply form is interaction-gated
  (isomorphic placeholder → pointerdown/focus activates, hover prefetches the chunk,
  focus is handed to the contenteditable after mount); the inline edit forms and admin
  dialogs pass `eager`, since the click that opened them was already the interaction.
  Labels: a workspace document's root payload (`i18n.inklingLabels`) supplies the table;
  a PUBLIC document has none, so hover/focus intent prefetches exactly the active
  locale's table chunk (`@/client/editor/inkling-labels::loadInklingLabels`)
  alongside the composer chunk, and the composer mounts only after it resolves
  (falling back to Inkling's English defaults on a chunk failure). The SSR
  placeholder is identical with or without a payload.
  The trimmed
  node set (`@/client/editor/comment-editor-nodes`: no headings, asides,
  tables, images, host cards, or math cards — the code block stays, and a
  ```math fence is the formula path, rendered to KaTeX MathML by
  `computeCommentContentProjection` at save time), the comment markdown transformers
  (`comment-markdown-transformers.ts` — the DEFAULT_TRANSFORMERS subset surviving the trim), and
  `isSnippetsEnabled={false}` / `isDragEnabled={false}`. No slash menu / card
  insert on this surface. The composer is a minimal surface: `isEmojiEnabled={false}`
  keeps the emoji typeahead (and its lazy emoji-mart chunk) out of nested/caption
  editors, and `codeEditor="plain"` edits code blocks in a static auto-sizing
  textarea (`CodeBlockPlainEditor`) — the CodeMirror chunk is never fetched on
  this surface, while rendered comments keep shiki highlighting from the
  server-side content projection. SSR: the server and the client's first render both
  render the wrapper's placeholder shell (byte-stable hydration; the chunk
  only ships to visitors who engage the composer), and the wrapper hands
  focus to the contenteditable after the editor mounts — the activating
  pointerdown landed on a node that is gone by then, and a replayed untrusted
  mousedown never runs the browser's native focus-the-contenteditable
  action. The canvas fills the shell: `min-height`/padding live on the
  contentEditable itself in `src/styles/inkling-comment-editor.css`, so the
  whole bordered box is clickable — a wrapper-owned box leaves the area
  below the one-line empty paragraph as dead click zones that never focus.
  The shell is transparent (`bg-transparent`) —
  no extra background behind the canvas, and no placeholder copy
  (`placeholder={<></>}` on the InklingSurface). Host styling hooks are scoped under
  `.kobato-comment-editor` in `src/styles/inkling-comment-editor.css`; the host also captures
  Ctrl+Q before inkling sees it (AsideNode is unregistered, so the quote→aside cycle would throw).
  ```

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
  Like button; the body format has no `friends` block.
- Adding a toggle touches: db schema + migration + snapshot, page projection, page service +
  schema, shared DTOs, `MetaSidebar` + `PageEditorShell`, and the `PageMetaDraft` meta type in
  `@/shared/types/pages` (passed through to `@/client/hooks/use-create-draft` by the editor shell).
  Test fixtures in `tests/_helpers/catalog.ts` and the page service tests under
  `tests/it/server/domains/pages/` need the new default.
