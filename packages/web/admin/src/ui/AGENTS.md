# UI conventions

`packages/web/admin/src/ui/` is the ADMIN product layer: admin components plus domain controllers. Reusable product orchestration — list/filter controllers, editor shells, draft persistence, uploads, editor composition — lives HERE beside the views that consume it; route modules wire loader data to controllers and controllers to views, and hold no reusable orchestration of their own. Leaf presentation components stay explicit-props with no reads from sessions, route params, request objects, or env vars. The public frontend and the cross-surface `shared`/`lib` tiers live in the split-out `@kobato/web-public` leaf (`packages/web/public/AGENTS.md`); the browser platform in `@kobato/web-client` (`packages/web/client/AGENTS.md`).

## Component tiers

- **`@kobato/ui/components`** — external design-system primitives (Base UI/shadcn variant), flat so
  `npx shadcn@latest add/diff` works. `components.json` points there. One `:root` token cascade covers
  public + admin; token tiers and the dark ladder: `packages/ui/src/styles/AGENTS.md`.
- **`@kobato/web-public/ui/shared` + `ui/lib`** — the cross-surface tiers rendered on BOTH the public
  chrome and the admin shell (notifications drawer, logout, LRC parser, debounced search, the root
  `LocaleSyncProvider` notice, `toast-api-error`). Admin reuses them across the package boundary; new
  cross-surface modules go THERE (`packages/web/public/AGENTS.md` → Structure), never into this package.
- **`ui/`** — grouped by domain, plus `shared/` and `shell/`.
  - `shared/` — cross-domain modules, grouped by concern: `list/` (`AdminListPage`, `AdminInfiniteListFooter`,
    `AdminPagination`, `use-admin-infinite-list`), `filter-bar/` (the pill engine plus `filter-pills-reducer`,
    `date-filter`, `calendar-picker`), `image-edit/` (`UploadImageDialog`, `ImageEditorCanvas`, `CoverInputRow`,
    `use-errored-src`), and `form/` (`LabelledCheckbox`, `LabelledRadio`). Only a module genuinely used by two or
    more unrelated domains stays at the `shared/` root (`ConfirmDialog`, `sortable.tsx`, `mask.ts` — the IP/display
    masking helpers, `SearchShortcutHint`, `use-file-upload.ts`). `useFileUpload`
    (`@kobato/web-admin/ui/shared/use-file-upload`) owns the CSRF read, accept/size guards, FormData POST, error
    unwrap, and toast choreography (the toast helpers live in `@kobato/web-public/ui/lib/toast-api-error`). Never hand-roll
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
    base node class from the shared spec (`@kobato/lexical/cards/`) through the `@kobato/inkling` barrel's
    `generateDecoratorNode` — a DISTINCT class object from the server projection's, since client and server each
    assemble their own class from the shared spec — then registers it via top-level `defineCard`. Decorate chrome
    and `exportDOM` markup share the spec's class/copy constants; `packages/web/admin/tests/unit/ui/editor/cards/`
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
    delegate query → error → skeleton → shell to `editor-shell/EditorRouteLoader`.
  - `editor-meta/` — the post/page meta form family (basic info, cover/OG, image field, language, publish
    status, title/slug, toggle rows/cards, create banner), consumed by `posts/` and `pages/` sidebars plus
    `editor-shell/EditorScreen`; it holds presentation/controllers only, never route loading.
  - `account/` — the `/admin/me` account domain (profile, login method, passkey, password, sessions, own
    comments); the route family name stays `me`, the UI module follows the `account.*` API group.
  - `branding/` — the `/admin/library/branding` branding view; images, fonts, and music remain their own domains.
  - `settings/` — card autosave model and section-grouped settings views: `packages/web/admin/src/ui/settings/AGENTS.md`.

## Cross-cutting UI modules

- Admin's reuse of public modules stays on the audited set pinned by
  `apps/kobato/tests/arch/web-direction.test.ts` (`ADMIN_PUBLIC_IMPORTS`): the chrome clock,
  `CommentContentHtml`, `LazyCommentBodyEditor`, `comment-body-helpers`, the music player card, and
  `widgets/Image` — plus the `ui/shared`/`ui/lib` cross-surface tiers above. Anything else public-side
  is public-only and belongs to `@kobato/web-public`.
- `@kobato/ui/lib` owns `cn`, `code-languages`, `I18nProvider` (react-intl provider + typed `useI18n()`;
  messages arrive as root-loader data), `ThemeProvider`, and generic presentation hooks.

## Merge-engine tokens

`cn.ts` builds the project-wide `cn()` with the `cn` package's `createCn` (`cn/config`), extending every project token
namespace so custom `--text-*`, `--color-*`, `--shadow-*` tokens land in the correct merge group — otherwise
`cn('text-toc-toggle text-ink-3')` collapses to `'text-ink-3'`.

- A new `--<namespace>-<name>` token in `tailwind.css` MUST pair with an entry in `cn.ts`'s per-namespace list —
  enforced by `packages/ui/tests/contract/tailwind-tokens.test.ts`.
- Never write `dark:bg-foo` on a tier-1 token — the `.dark { }` rebind already handles the switch.
- Adjacent dark surface tiers stay 3–8 L apart; no `--line-*` token shares a value with any `--surface-*` token (both
  the `border-line` outline and the `--accent` hover state vanish).

## File naming

Every module under `packages/web/{admin,public,client}/src` follows one of six shapes — a file that fits none is misplaced:

- `PascalCase.tsx` — a React component (one exported component per file; `PasswordToggle.tsx`).
- `use-kebab-case.ts(x)` — a hook; camelCase hook filenames are not allowed (`use-admin-infinite-list.ts`).
- `kebab-case.ts` — a module of components; one `kebab-case.<ext>.tsx` if it renders JSX (`sortable.tsx`).
- `*-context.tsx` — a React context provider (`music-player-context.tsx`, `analytics-state-context.tsx`).
- `filter-fields.ts` — the filter-descriptor family, always `.ts` and always at the domain root.
- `index.ts` — banned (no barrels).

Directories are plural when they hold a collection of entities (`comments/`, `images/`, `webmentions/`) and match
the `@kobato/api` contract group they drive; mass-noun domains stay singular (`music/`, `settings/`, `analytics/`).
`tasks/` is the one intentional exception: the operator-facing noun is "task" (route `/admin/tasks`, copy
`admin.tasks.*`) while its wire group is `jobs` — keep the UI noun and the `jobs` contract noun as they are.

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
  `EagerAnimatePresence`) with constants from `@kobato/web-client/lib/motion` — never React `<ViewTransition>` or
  `document.startViewTransition` (root `AGENTS.md` holds the full rule; the ThemeProvider theme wipe is the sole
  exception).
- Use `<Image />` from `@kobato/web-public/ui/widgets/Image` for transformed remote images.
- **Shiki is SSR-only.** Never import `shiki`, `@shikijs/langs`, or `@shikijs/themes` in `packages/web/admin/src/ui/` — its Oniguruma
  `.wasm` violates the strict `script-src` CSP. Highlighted code arrives pre-rendered in the DTO (`detailsHtml` on
  audit-log items) and renders via `dangerouslySetInnerHTML` + `sanitizeHtml(html, 'shiki')` from
  `@kobato/sanitize/sanitize-html` (keeps inline `style` and shiki classes, strips the rest).
- Stateful orchestrators (editor shells, multi-stage forms, comment threads) aim for ≤500 LOC per file; past that,
  extract shared state into a hook, sub-components into siblings, or per-renderer modules.

## Content editors

- Storage: Lexical editor states (`@kobato/lexical/schema` posts/pages, `@kobato/lexical/comment-schema`
  comments). The friends grid is NOT a body block — it is the `page.show_friends` toggle.
- Admin body editor: `@kobato/web-admin/ui/editor/PageBodyEditor` wraps the inkling composer (`@kobato/inkling`) through the skeleton
  shared with comments (`@kobato/web-client/editor/editor-surface`); the platform layer owns the composer surface, while kobato glue
  (host cards, `KobatoImageNode`, upload/picker wiring) lives in `@kobato/web-admin/ui/editor/` (see the `editor/` tier above).
  Inserts use `INSERT_CARD_COMMAND`; host hooks sit under `.kobato-page-editor` in `packages/web/admin/src/styles/inkling-editor.css`.
  The locale's Inkling label table arrives as root-loader data (`i18n.inklingLabels`), imported by no UI module.
- Editor copy lives in `admin.editor.*`, read with `useI18n()` (`t` / `tRich`). The entity noun ("post" / "page")
  never crosses a shared boundary as text: configs and props carry `entityLabelId` (`UiMessageId`, e.g.
  `admin.editor.entity.post`), resolved as `t(entityLabelId, { entity })` in an ICU template. Inkling host-card
  `menu[].label`/`desc` stay English fallbacks; the locale's table supplies text via `labelKey` (`menu.host.*`).
- The comment composer lives in the public leaf (`@kobato/web-public/ui/comments` — see `packages/web/public/AGENTS.md`);
  admin dialogs mount it through `@kobato/web-public/ui/comments/LazyCommentBodyEditor` with `eager` +
  `focusOnMount`.

## Page draft preview

- `PageDetailBody` takes `draftMarker`: `'draft'`【草稿】 (catalog miss, admin sees latest draft),
  `'unpublished-draft'`【未发布的草稿】 (catalog hit + `?draft=true`, newer draft exists), `'published-draft'`
  【已发布的草稿】 (catalog hit + `?draft=true`, latest revision IS published), or `null`.

## Page meta toggles

- `page` carries operator-facing booleans (`comments_enabled`, `show_toc`, `show_friends`) edited from `MetaSidebar`
  and consumed by `routes/public/page/detail.tsx` as render-time branches — never body mutations. `show_friends`
  appends the global friends grid below the body before the Like button; the body format has no `friends` block.
- Adding a toggle touches: db schema + migration + snapshot, page projection, page service + schema, shared DTOs,
  `MetaSidebar` + `PageEditorShell`, and the `PageMetaDraft` meta type in `@kobato/web-admin/ui/pages/page-meta` (the post
  twin lives in `@kobato/web-admin/ui/posts/post-meta`; both flow through to `@kobato/web-admin/ui/editor-shell/drafts/use-create-draft` by the editor shell). Test fixtures in `@kobato/test/catalog.ts` and the page
  service tests under `packages/server/tests/it/server/domains/pages/` need the new default.
