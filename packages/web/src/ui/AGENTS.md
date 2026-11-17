# UI conventions

`packages/web/src/ui/` is the product layer: product components plus domain controllers. Reusable product orchestration — list/filter controllers, editor shells, draft persistence, uploads, editor composition — lives HERE beside the views that consume it; route modules wire loader data to controllers and controllers to views, and hold no reusable orchestration of their own. Leaf presentation components stay explicit-props with no reads from sessions, route params, request objects, or env vars.

## Component tiers

- **`@kobato/ui/components`** — external design-system primitives (Base UI/shadcn variant), flat so
  `npx shadcn@latest add/diff` works. `components.json` points there. One `:root` token cascade covers
  public + admin; token tiers and the dark ladder: `packages/ui/src/styles/AGENTS.md`.
- **`ui/public/`** — public-only: `chrome/`, `post/`, `comments/`, `friends/`, `widgets/`, `music-player/`,
  single-file leaves. Comment thread state is four contexts in `comments-context.ts` (Tree / Identity / ReplySlot /
  Actions) so leaf rows subscribe to slices. `MusicPlayerCard` hydrates onto `.aplayer[data-*]` mount points via
  `useMusicPlayers`.
- **`ui/shared/`** — used by BOTH the public chrome and the admin shell (currently `notifications/` — the global drawer opened
  from the admin sidebar and the public user menu, whose lists stay live through the `use-now.ts` minute clock;
  `auth/use-logout.ts` — POST + CSRF logout followed by a hard navigation so client caches drop with the session;
  `music/lrc.ts` — the LRC lyric parser shared by the public music player and the admin lyrics display).
  `notification-meta.ts` owns kind/source → icon, `kindLabelId` ids, and `formatNotificationTime({ locale, timeZone, now })`
  — the consumer resolves the id with its own `t`. Anything only one side uses stays in that tier.
- **`ui/admin/`** — grouped by domain, plus `shared/` and `shell/`.
  - `shared/` — cross-domain modules (`useAdminInfiniteList`, `filterPillsReducer`, `sortable.tsx`, `mask.ts` — the
    IP/display masking helpers, `use-file-upload.ts`). `useFileUpload`
    (`@kobato/web/ui/admin/shared/use-file-upload`) owns the CSRF read, accept/size guards, FormData POST, error
    unwrap, and toast choreography (the toast helpers live in `@kobato/web/ui/lib/toast-api-error`). Never hand-roll
    a fetch upload in a view. Hook copy is translated, never literal: a hook that only runs under the React tree
    (`useAutosave`) reads `useI18n()` itself, while hooks callable from non-React entry points (`useFileUpload`) take
    the caller's `t` explicitly. English stays the catalog baseline and every locale stays in step. `sortable.tsx`
    is the one dnd-list adapter: `useSortableSensors`, `useSortableRow` (destructure its result — member access
    trips the react-compiler ref heuristic), `SortableDragHandle`, `resolveSortableMove`. New sortable lists use it;
    never copy row chrome.
  - `editor/` — the page-body composer and its kobato glue: `PageBodyEditor` (inkling composer wrapper; the only
    module other admin domains import), `pickers/` (`ImageLibraryPicker`, `MusicPickerDialog`),
    `lexical-body-diff.tsx`, and the editor platform consumers:
    `page-editor-nodes` (every mounted type must stay inside `FULL_EDITOR_NODE_TYPES`, contract-tested; AsideNode
    filtered, KobatoImageNode replaces the stock image card by type), `kobato-image-node` (the stock ImageNode
    subclass persisting the four kobato dataset keys), `image-insert-override` (HIGH-priority
    INSERT_IMAGE_COMMAND / OPEN_IMAGE_LIBRARY_COMMAND handlers — the two surviving class-identity gates: inserts
    build the kobato class, and the library intent inserts an empty card with the `openPicker` payload flag so the
    inkling pick seam opens the library picker) and `image-library-pick` (the 'image' picker registration through
    the seam's variant channel, `registerCardPicker`, plus the pick→dataset write through the card write seam),
    `page-editor-upload` (paste/drop/file-dialog uploads through `orpc.admin.images.upload`; the uploader reads
    `useI18n()` itself and memoizes `upload` on the translator so the composer's identity contract holds),
    `page-editor-card-config` + `render-math` (card policy + the debounced server KaTeX preview channel — both are
    factories taking the translator, so `PageBodyEditor` memoizes one card config per `t`; `resolveMathError` turns
    the server's error descriptor into the single string Inkling accepts, falling back to `fallbackMessage` when
    the active catalog does not know the key — a raw catalog key never reaches the editor), `use-focus-mode` (the
    writing-focus preference toggle), `cards/menu-matches` (the slash-menu matcher constants over the shared
    specs), and `cards/` — the host-card assemblies (solution / two-column / music-player): each module builds its
    base node class from the shared spec (`@kobato/pt/cards/`) through the `@kobato/inkling` barrel's
    `generateDecoratorNode` — a DISTINCT class object from the server projection's, since client and server each
    assemble their own class from the shared spec — then registers it via top-level `defineCard`. Decorate chrome
    and `exportDOM` markup share the spec's class/copy constants; `packages/web/tests/unit/ui/admin/editor/cards/`
    pins that parity (the WYSIWYG gate). The specs' `menu[].label`/`desc` are English fallbacks, never a hardcoded
    locale — the slash menu localizes them through `labelKey` (`menu.host.<key>.*` in the `inkling-labels/`
    tables), and the card chrome's own copy reads the `admin.editor.cards.*` catalog keys through `useI18n()`.
  - `editor-shell/` — draft/publish orchestration. `useEditorShellState` orchestrates both shells (body/meta drafts,
    shortcuts, meta-panel toggle); extend it rather than adding shared state to either Shell. `useEditorShellPersist`
    owns save-flow status + baselines, autosave wiring, and the four persist handlers, split into sibling slices:
    `use-editor-shell-persist-race` (revision-token race + `server` freeze leg), `use-editor-shell-persist-conflict`
    (local-draft session + conflict detection, `local` freeze leg), `use-editor-shell-persist-mutations` (four wire
    mutations — declaration order is test-pinned — plus note* interpreters); wire/status decisions are pure planners
    in `editor-shell-persist-plan.ts`. `useAutosave` is the sole baseline owner behind `setBaseline` (mount seed
    `initialBaseline`); `EditorScreen` is driven by an `EditorScreenAdapter` from `makeEditorAdapter`.
    `Post/PageEditorShell.tsx` (in `posts/`, `pages/`) are config-only call sites; `Post/PageEditorRoute.tsx`
    delegate query → error → skeleton → shell to `editor-shared/EditorRouteLoader`.
  - `settings/` — card autosave model and wrappers: `packages/web/src/ui/admin/settings/AGENTS.md`.

## Cross-cutting UI modules

- `ui/public/post/` — bodies render the saved `bodyHtml` projection: `DetailBodyChrome` sanitizes it with
  `sanitizeHtml(html, 'body')` into the `post-content` typeset container (`typeset typeset-post`); five hydration
  hooks then enhance the static markup: `useMediumZoom` (`@kobato/web/ui/public/post/use-medium-zoom`), `useThumbhashHydration`,
  `useCodeCopyButtons`, `useMusicPlayers`, `useFootnotePreviews` (all five live beside the chrome). All five take
  `bodyHtml` as their re-scan key — the content div is reused across client navigations (only innerHTML swaps), so
  without it the previous article's enhancements leak onto detached nodes. Comment bodies render the stored `content`
  HTML through `comments/CommentContentHtml` with the narrower `'comment'` sanitize preset (comment whitelist: no
  media/headings).
- `@kobato/ui/lib` owns `cn`, `code-languages`, `I18nProvider` (react-intl provider + typed `useI18n()`;
  messages arrive as root-loader data), `ThemeProvider`, and generic presentation hooks.
- `ui/lib/LocaleSyncProvider` is the web-owned ROOT cross-tab loop mounted by `src/root.tsx`: a registered
  settings workspace flushes every dirty card then reloads once, on success only; every other document is
  NEVER reloaded automatically — a localized `role="alert"` notice with an explicit Reload keeps unsaved
  input; cards use `useLocaleSyncPublish`, and `SettingsFlushProvider` registers the flush host. Full contract:
  `packages/web/src/ui/admin/settings/AGENTS.md`.

## Merge-engine tokens

`cn.ts` builds the project-wide `cn()` with the `cn` package's `createCn` (`cn/config`), extending every project token
namespace so custom `--text-*`, `--color-*`, `--shadow-*` tokens land in the correct merge group — otherwise
`cn('text-toc-toggle text-ink-3')` collapses to `'text-ink-3'`.

- A new `--<namespace>-<name>` token in `tailwind.css` MUST pair with an entry in `cn.ts`'s per-namespace list —
  enforced by `packages/ui/tests/contract/tailwind-tokens.test.ts`.
- Never write `dark:bg-foo` on a tier-1 token — the `.dark { }` rebind already handles the switch.
- Adjacent dark surface tiers stay 3–8 L apart; no `--line-*` token shares a value with any `--surface-*` token (both
  the `border-line` outline and the `--accent` hover state vanish).

## Component & styling rules

- Compose with children and slots, not boolean prop matrices (`architecture-avoid-boolean-props`); prefer compound
  components over render-prop callbacks. Recursive components recurse by name.
- React 19: no `forwardRef` for new components — refs flow through props.
- Raw HTML uses `dangerouslySetInnerHTML` on the host element — no generic `Html` wrapper.
- Conditional classNames go through `cn()` from `@kobato/ui/lib/cn`.
- Icons: named imports from `lucide-react` only; `@kobato/ui/icons` is static-export. No `<Icon name="..." />` lookups.
- Interface copy is a UI message id resolved through `useI18n()`, including the accessible labels inside
  `@kobato/ui/components` primitives (`common.*` in the UI catalog). A test rendering one of those primitives directly must
  mount `I18nProvider` (`@kobato/test/i18n-render.ts`).
- Animation is Motion Only: JS-driven animation uses the `@kobato/ui/components/lazy-motion` facade (`LazyMotion*` /
  `LazyAnimatePresence`; browser-only popups that cannot tolerate a static-node swap use `EagerMotion*` /
  `EagerAnimatePresence`) with constants from `@kobato/web/client/lib/motion` — never React `<ViewTransition>` or
  `document.startViewTransition` (root `AGENTS.md` holds the full rule; the ThemeProvider theme wipe is the sole
  exception).
- Use `<Image />` from `@kobato/web/ui/public/widgets/Image` for transformed remote images.
- **Shiki is SSR-only.** Never import `shiki`, `@shikijs/langs`, or `@shikijs/themes` in `packages/web/src/ui/` — its Oniguruma
  `.wasm` violates the strict `script-src` CSP. Highlighted code arrives pre-rendered in the DTO (`detailsHtml` on
  audit-log items) and renders via `dangerouslySetInnerHTML` + `sanitizeHtml(html, 'shiki')` from
  `@kobato/sanitize/sanitize-html` (keeps inline `style` and shiki classes, strips the rest).
- Stateful orchestrators (editor shells, multi-stage forms, comment threads) aim for ≤500 LOC per file; past that,
  extract shared state into a hook, sub-components into siblings, or per-renderer modules.

## Content editors

- Storage: Lexical editor states (`@kobato/pt/schema` posts/pages, `@kobato/pt/comment-schema`
  comments). The friends grid is NOT a body block — it is the `page.show_friends` toggle.
- Public SSR: bodies render the saved `bodyHtml` projection (NULL falls back to an on-the-fly headless projection
  server-side — `packages/server/AGENTS.md` → Content) through `DetailBodyChrome` and the hooks above; heading anchor ids
  come from the revision's `headings` column.
- Admin body editor: `@kobato/web/ui/admin/editor/PageBodyEditor` wraps the inkling composer (`@kobato/inkling`) through the skeleton
  shared with comments (`@kobato/web/client/editor/editor-surface`); the platform layer owns the composer surface, while kobato glue
  (host cards, `KobatoImageNode`, upload/picker wiring) lives in `@kobato/web/ui/admin/editor/` (see the `editor/` tier above).
  Inserts use `INSERT_CARD_COMMAND`; host hooks sit under `.kobato-page-editor` in `packages/web/src/styles/inkling-editor.css`.
  The locale's Inkling label table arrives as root-loader data (`i18n.inklingLabels`), imported by no UI module.
- Editor copy lives in `admin.editor.*`, read with `useI18n()` (`t` / `tRich`). The entity noun ("post" / "page")
  never crosses a shared boundary as text: configs and props carry `entityLabelId` (`UiMessageId`, e.g.
  `admin.editor.entity.post`), resolved as `t(entityLabelId, { entity })` in an ICU template. Inkling host-card
  `menu[].label`/`desc` stay English fallbacks; the locale's table supplies text via `labelKey` (`menu.host.*`).
- Comment editor: `@kobato/web/ui/public/comments/CommentBodyEditor` wraps the inkling composer with the trimmed node set
  (`@kobato/web/ui/public/comments/editor/comment-editor-nodes`: no headings, asides, tables, images, host cards, or math cards — code
  blocks stay; a ```math fence is the formula path, projected to KaTeX MathML by `computeCommentContentProjection` at
  save time; contract-tested against `COMMENT_COMPOSER_NODE_TYPES`), the `DEFAULT_TRANSFORMERS` subset in
  `ui/public/comments/editor/comment-markdown-transformers.ts` (only shortcuts whose dependencies survive the trim:
  quote/list/code-fence/text-format/link), and the seed-time legacy downgrade in `comment-legacy-math.ts` (maps legacy
  math/math-inline nodes onto the fence dialect so legacy comments still open in the trimmed composer),
  `isSnippetsEnabled={false}` / `isDragEnabled={false}`, and no slash menu or card insert. `isEmojiEnabled={false}`
  keeps the emoji typeahead (and its lazy emoji-mart chunk) out of nested/caption editors; `codeEditor="plain"` edits
  code blocks in a static auto-sizing textarea (`CodeBlockPlainEditor`), so no CodeMirror chunk loads here while
  rendered comments keep shiki highlighting from the server projection.
- Comment editor loading: consumers mount through `@kobato/web/ui/public/comments/LazyCommentBodyEditor` (composer, inkling
  island and `inkling-comment-editor.css` ride a lazy chunk; the public post page stays editor-free). The
  always-visible reply form is interaction-gated (isomorphic placeholder → pointerdown/focus activates, hover
  prefetches, focus handed over after mount); the inline reply form, public edit forms, and admin dialogs pass
  `eager`, and the reply/edit forms add `focusOnMount`, both hover-prefetching chunks via
  `warmCommentEditorChunks`. A workspace root payload supplies the label table (`i18n.inklingLabels`); a PUBLIC
  document prefetches the active locale's chunk (`@kobato/web/client/editor/inkling-labels::loadInklingLabels`) and mounts only
  after it resolves (Inkling English defaults on failure), SSR placeholder identical either way. Focus activations
  hold the iOS viewport zoom lock (see `packages/web/src/client/AGENTS.md` → iOS auto-zoom).
- Comment editor hydration: server and client first render both emit the wrapper's placeholder shell (byte-stable
  hydration); the wrapper hands focus to the contenteditable after mount, because the activating pointerdown landed
  on a node that is gone. `min-height`/padding live on the contentEditable in `packages/web/src/styles/inkling-comment-editor.css`,
  so the whole bordered canvas is clickable (a wrapper-owned box leaves dead click zones below the one-line empty
  paragraph). The shell is transparent (`bg-transparent`, no background, `placeholder={<></>}`); host hooks sit under
  `.kobato-comment-editor` in the same file, and the host captures Ctrl+Q before inkling sees it (AsideNode is
  unregistered, so the quote→aside cycle would throw).

## Page draft preview

- `PageDetailBody` takes `draftMarker`: `'draft'`【草稿】 (catalog miss, admin sees latest draft),
  `'unpublished-draft'`【未发布的草稿】 (catalog hit + `?draft=true`, newer draft exists), `'published-draft'`
  【已发布的草稿】 (catalog hit + `?draft=true`, latest revision IS published), or `null`.

## Page meta toggles

- `page` carries operator-facing booleans (`comments_enabled`, `show_toc`, `show_friends`) edited from `MetaSidebar`
  and consumed by `routes/public/page/detail.tsx` as render-time branches — never body mutations. `show_friends`
  appends the global friends grid below the body before the Like button; the body format has no `friends` block.
- Adding a toggle touches: db schema + migration + snapshot, page projection, page service + schema, shared DTOs,
  `MetaSidebar` + `PageEditorShell`, and the `PageMetaDraft` meta type in `@kobato/web/ui/admin/pages/page-meta` (the post
  twin lives in `@kobato/web/ui/admin/posts/post-meta`; both flow through to
  `@kobato/web/ui/admin/editor-shell/drafts/use-create-draft` by the editor shell). Test fixtures in `@kobato/test/catalog.ts` and the page
  service tests under `packages/server/tests/it/server/domains/pages/` need the new default.
