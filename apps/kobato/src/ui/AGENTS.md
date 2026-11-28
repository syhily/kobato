# UI conventions

`apps/kobato/src/ui/` is the admin product layer of the workspace (the kobato app, ADR-0012 §2): admin components plus
domain controllers. Reusable product orchestration (list/filter controllers, editor shells, draft persistence, uploads)
lives HERE beside its consumers; route modules wire loader data and hold no reusable orchestration. Leaf presentation
components are explicit-props — no reads from sessions, route params, request objects, or env vars.

## Component tiers

- **`@kobato/ui/components`** — external design-system primitives, flat so `npx shadcn@latest add/diff` works;
  `components.json` points there; `components/document-shell/` is the document shell the root mounts, and `BrandLogo` /
  `ChunkReloadOverlay` / `Image` are the shared document modules. `@kobato/ui/lib` owns `cn`, `code-languages`,
  `I18nProvider`, `ThemeProvider`, the settings contexts (`blog-settings-context`), locale sync, the document facts
  context and hooks, and generic presentation hooks.
- **`@kobato/web-kit`** — the cross-surface features that call a procedure (the notifications family, `use-logout`); new
  cross-surface modules go THERE only when they call the wire and render — otherwise they are `@kobato/ui`'s (the
  settings contexts, `Image`, `BrandLogo`, locale sync, the document clock, and the document shell already are), and a
  procedure-calling hook that needs no UI is the contract's own (`@kobato/api/browser/use-notifications`, which
  `shell/AppSidebar` reads for the unread badge). The comment composer is Inkling's (`@kobato/inkling/comment/*`); no
  module in this tree or in `@kobato/web-kit` reads the root loader for document facts — the root maps it into the
  document shell (`@kobato/ui/components/document-shell`), and the only `useRouteLoaderData` calls under
  `apps/kobato/src` and `apps/sayaka/src` are the two roots' own `Layout`s and sayaka's `routes/layout.tsx`
  (`currentUser`). Workspace modules read the shell's facts instead: `useDocumentCsrfToken` (the kit's `useLogout`,
  `AdminInstallForm`, `BackupView`), `useDocumentClock` (`UsersTable`), `use-inkling-labels` (the one reader of the
  `labels` fact), and the settings contexts (`useFontsSettingsOptional` in `ui/fonts/font-slots.ts`).
- `ui/shared/` — cross-domain modules (`list/`, `filter-bar/`, `image-edit/`, `form/`); only genuinely multi-domain
  modules stay at the root — `use-inkling-labels.ts` (`useKobatoInklingLabels`, the one reader of the document's
  `labels` fact — the root loader's `i18n.inklingLabels` mapped into the document shell; the page composer and the
  comment dialogs all reach it through here). `useFileUpload` owns file/field guards, typed-oRPC submission, error
  unwrap, and toast choreography — never hand-roll a fetch upload. `sortable.tsx` is the one dnd-list adapter
  (`useSortableRow` — destructure its result; member access trips the react-compiler ref heuristic).
- `editor/` — the page-body composer glue: `PageBodyEditor` (the only module other admin domains import, mounting
  Inkling's public `InklingHostComposer` with the root-loader label table), `pickers/`, and the platform consumers
  (page-editor nodes/upload/picker/card-config, `music-card-picker.tsx` registering the picker dialog at module scope).
  Decorate chrome and `exportDOM` markup share the spec's constants (parity pinned by
  `apps/kobato/tests/unit/ui/editor/cards/`); spec `menu[].label`/`desc` are English fallbacks, the slash menu localizes
  through `labelKey`, card chrome reads `admin.editor.cards.*`.
- `editor-shell/` — draft/publish orchestration: `useEditorShellState` orchestrates both shells (extend it, never add
  shared state); `useAutosave` is the sole baseline owner behind `setBaseline`; `Post/PageEditorShell.tsx` are
  config-only; `Post/PageEditorRoute.tsx` delegate to `EditorRouteLoader`.
- `editor-meta/` — the post/page meta form family (presentation/controllers only); `account/`, `music/` (+
  `music/player/`), `branding/` — product domains; `settings/` has its own AGENTS.md.

Token rules (merge groups, dark tiers) live in `packages/web/ui/src/styles/AGENTS.md`.

## File naming

- `PascalCase.tsx` — a React component (one per file); `use-kebab-case.ts(x)` — a hook (camelCase hook filenames are
  banned); `kebab-case.ts` — a module of components; `*-context.tsx` — a context provider; `filter-fields.ts` — the
  filter-descriptor family (`.ts` at the domain root); `index.ts` — banned.
- Directories are plural for entity collections and match the `@kobato/api` contract group they drive; mass-noun domains
  stay singular. `jobs/` matches the `admin.jobs` wire group; the screen keeps operator-facing nouns (route
  `/admin/tasks`, copy `admin.tasks.*`).

## Component & styling rules

- Compose with children and slots, not boolean prop matrices; React 19: no `forwardRef` on new components.
- Raw HTML uses `dangerouslySetInnerHTML` on the host element — no generic wrapper. Conditional classNames go through
  `cn()`.
- Icons: named imports from `lucide-react` only. Interface copy is a UI message id resolved through `useI18n()` (tests
  rendering `@kobato/ui/components` primitives directly must mount `I18nProvider`,
  `@kobato/ui/tests/utils/i18n-render.tsx`).
- Animation is Motion Only: the `@kobato/ui/components/lazy-motion` facade with constants from `@kobato/ui/lib/motion`
  (root `AGENTS.md` holds the full rule).
- Use `<Image />` from `@kobato/ui/components/Image` for transformed remote images.
- **Shiki is SSR-only** — never import `shiki`/`@shikijs/*` here (Oniguruma `.wasm` violates the strict CSP);
  highlighted code arrives pre-rendered.
- Stateful orchestrators aim for ≤500 LOC per file; past that, extract.

## Content editors

- Storage: Lexical states (`@kobato/inkling/headless/schema` posts/pages, `comment-schema` comments). The friends grid
  is the `page.show_friends` toggle, not a body block.
- `PageBodyEditor` mounts Inkling's public `InklingHostComposer` (the `@kobato/ui` locale/theme binding) over
  `useEditorSurface`, `blockQuoteAsideCycle`, and `excludeBaseNodes`, handing it the root-loader table through
  `labels={useKobatoInklingLabels()}`; kobato glue (host cards, `KobatoImageNode`, upload/picker wiring) lives in
  `ui/editor/`. Host hooks sit under `.kobato-page-editor` in `apps/kobato/src/ui/styles/inkling-editor.css`. The
  locale's Inkling label table arrives as root-loader data (`i18n.inklingLabels`) that the root maps into the document
  shell's `labels` fact; it is read only through `ui/shared/use-inkling-labels` (over `@kobato/ui`'s
  `useDocumentLabels`) — never by a shared or Inkling module.
- Editor copy lives in `admin.editor.*`. The entity noun never crosses a shared boundary as text: configs carry
  `entityLabelId` (`UiMessageId`) resolved via ICU `select`. The comment composer is `@kobato/inkling/comment`
  (`LazyCommentBodyEditor`, `CommentContentHtml`, `comment-body-helpers`); admin dialogs mount it with `eager` and hand
  it the root-loader table through the `labels` prop, read with `useKobatoInklingLabels` at the top of the component.

## Page meta toggles

- `page` carries operator-facing booleans (`comments_enabled`, `show_toc`, `show_friends`) edited from `MetaSidebar` and
  consumed as render-time branches — never body mutations.
- Adding a toggle touches: db schema + migration + snapshot, page projection, page service + schema, shared DTOs,
  `MetaSidebar` + `PageEditorShell`, the `PageMetaDraft`/`PostMetaDraft` types, and the catalog/service test fixtures.
