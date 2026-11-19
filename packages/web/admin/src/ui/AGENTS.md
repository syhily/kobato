# UI conventions

`packages/web/admin/src/ui/` is the ADMIN product layer: admin components plus domain controllers. Reusable product orchestration — list/filter controllers, editor shells, draft persistence, uploads, editor composition — lives HERE beside the views that consume it; route modules wire loader data to controllers and hold no reusable orchestration of their own. Leaf presentation components stay explicit-props with no reads from sessions, route params, request objects, or env vars. The public frontend and the cross-surface `shared`/`lib` tiers live in `@kobato/web-public`; the browser platform in `@kobato/web-client`.

## Component tiers

- **`@kobato/ui/components`** — external design-system primitives (Base UI/shadcn variant), flat so `npx shadcn@latest add/diff` works; `components.json` points there.
- **`@kobato/web-public/ui/shared` + `ui/lib`** — the cross-surface tiers rendered on BOTH the public chrome and the admin shell. Admin reuses them across the package boundary; new cross-surface modules go THERE, never into this package.
- `ui/shared/` — cross-domain modules grouped by concern: `list/`, `filter-bar/` (the pill engine), `image-edit/`, `form/`. Only a module genuinely used by two or more unrelated domains stays at the `shared/` root (`ConfirmDialog`, `sortable.tsx`, `mask.ts`, `SearchShortcutHint`, `use-file-upload.ts`).
  - `useFileUpload` owns the CSRF read, accept/size guards, FormData POST, error unwrap, and toast choreography — never hand-roll a fetch upload in a view. Hook copy is translated, never literal: a hook that only runs under the React tree reads `useI18n()` itself, while hooks callable from non-React entry points take the caller's `t`.
  - `sortable.tsx` is the one dnd-list adapter (`useSortableRow` — destructure its result; member access trips the react-compiler ref heuristic). New sortable lists use it; never copy row chrome.
- `editor/` — the page-body composer and its kobato glue: `PageBodyEditor` (the only module other admin domains import), `pickers/`, `lexical-body-diff.tsx`, and the platform consumers: `page-editor-nodes` (every mounted type must stay inside `FULL_EDITOR_NODE_TYPES`, contract-tested), `kobato-image-node` (the stock ImageNode subclass persisting the four kobato dataset keys), `image-insert-override` (HIGH-priority INSERT handlers; the library intent inserts an empty card with the `openPicker` payload flag), `image-library-pick` (the 'image' picker registration through the seam's variant channel), `page-editor-upload` (uploads through `orpc.admin.images.upload`; the uploader reads `useI18n()` itself and memoizes `upload` on the translator), `page-editor-card-config` + `render-math` (factories taking the translator, so `PageBodyEditor` memoizes one card config per `t`; `resolveMathError` turns the server's error descriptor into the single string Inkling accepts — a raw catalog key never reaches the editor), `use-focus-mode`, `cards/menu-matches`, and `cards/` — the host-card assemblies (solution / two-column / music-player): each builds its base node class from the shared spec (`@kobato/lexical/cards/`) through the `@kobato/inkling` barrel's `generateDecoratorNode` — a DISTINCT class object from the server projection's, since client and server each assemble their own — then registers it via top-level `defineCard`. Decorate chrome and `exportDOM` markup share the spec's constants; `packages/web/admin/tests/unit/ui/editor/cards/` pins that parity (the WYSIWYG gate). The specs' `menu[].label`/`desc` are English fallbacks; the slash menu localizes through `labelKey` (`menu.host.<key>.*`), the card chrome reads `admin.editor.cards.*` through `useI18n()`.
- `editor-shell/` — draft/publish orchestration. `useEditorShellState` orchestrates both shells — extend it rather than adding shared state. `useEditorShellPersist` owns save-flow status + baselines and the four persist handlers, split into sibling slices (`use-editor-shell-persist-race`, `-conflict`, `-mutations`); wire/status decisions are pure planners in `editor-shell-persist-plan.ts`. `useAutosave` is the sole baseline owner behind `setBaseline`; `EditorScreen` is driven by an `EditorScreenAdapter` from `makeEditorAdapter`. `Post/PageEditorShell.tsx` are config-only call sites; `Post/PageEditorRoute.tsx` delegate to `editor-shell/EditorRouteLoader`.
- `editor-meta/` — the post/page meta form family, consumed by `posts/`, `pages/`, and `editor-shell/EditorScreen`; presentation/controllers only, never route loading.
- `account/` — the `/admin/me` domain (the route family name stays `me`, the UI module follows the `account.*` API group).
- `music/` — the library domain plus `music/player/`, the playback machinery mounted once by the admin shell.
- `branding/` — the branding view; images, fonts, and music remain their own domains.
- `settings/` — `packages/web/admin/src/ui/settings/AGENTS.md`.

## Cross-cutting UI modules

- Admin's reuse of public modules stays on the audited set pinned by `ADMIN_PUBLIC_IMPORTS` in `apps/kobato/tests/arch/web-direction.test.ts` (the chrome clock, `CommentContentHtml`, `LazyCommentBodyEditor`, `comment-body-helpers`, the music player card, `widgets/Image`, plus the cross-surface tiers). Anything else public-side is public-only.
- `@kobato/ui/lib` owns `cn`, `code-languages`, `I18nProvider` (typed `useI18n()`; messages arrive as root-loader data), `ThemeProvider`, and generic presentation hooks.

## Merge-engine tokens

`cn.ts` builds the project-wide `cn()` extending every project token namespace so custom `--text-*`, `--color-*`, `--shadow-*` tokens land in the correct merge group.

- A new `--<namespace>-<name>` token in `tailwind.css` MUST pair with an entry in `cn.ts`'s per-namespace list — enforced by `packages/ui/tests/contract/tailwind-tokens.test.ts`.
- Never write `dark:bg-foo` on a tier-1 token — the `.dark { }` rebind handles the switch. Adjacent dark surface tiers stay 3–8 L apart; no `--line-*` token shares a value with any `--surface-*` token.

## File naming

Every module under `packages/web/{admin,public,client}/src` follows one of six shapes:

- `PascalCase.tsx` — a React component (one per file).
- `use-kebab-case.ts(x)` — a hook; camelCase hook filenames are not allowed.
- `kebab-case.ts` — a module of components; `kebab-case.<ext>.tsx` if it renders JSX.
- `*-context.tsx` — a React context provider.
- `filter-fields.ts` — the filter-descriptor family, always `.ts` at the domain root.
- `index.ts` — banned (no barrels).

Directories are plural for entity collections and match the `@kobato/api` contract group they drive; mass-noun domains stay singular. `jobs/` matches the `admin.jobs` wire group; the screen keeps its operator-facing nouns (route `/admin/tasks`, copy `admin.tasks.*`).

## Component & styling rules

- Compose with children and slots, not boolean prop matrices; prefer compound components over render-prop callbacks.
- React 19: no `forwardRef` for new components — refs flow through props.
- Raw HTML uses `dangerouslySetInnerHTML` on the host element — no generic `Html` wrapper. Conditional classNames go through `cn()`.
- Icons: named imports from `lucide-react` only. No `<Icon name="..." />` lookups.
- Interface copy is a UI message id resolved through `useI18n()`, including inside `@kobato/ui/components` primitives. A test rendering one of those primitives directly must mount `I18nProvider` (`@kobato/web-admin/tests/utils/i18n-render.tsx`).
- Animation is Motion Only: the `@kobato/ui/components/lazy-motion` facade with constants from `@kobato/web-client/lib/motion` — never React `<ViewTransition>` or `document.startViewTransition` (root `AGENTS.md` holds the full rule; the ThemeProvider theme wipe is the sole exception).
- Use `<Image />` from `@kobato/web-public/ui/widgets/Image` for transformed remote images.
- **Shiki is SSR-only.** Never import `shiki`, `@shikijs/langs`, or `@shikijs/themes` here — its Oniguruma `.wasm` violates the strict CSP. Highlighted code arrives pre-rendered in the DTO and renders via `dangerouslySetInnerHTML` + `sanitizeHtml(html, 'shiki')`.
- Stateful orchestrators (editor shells, multi-stage forms, comment threads) aim for ≤500 LOC per file; past that, extract.

## Content editors

- Storage: Lexical editor states (`@kobato/lexical/schema` posts/pages, `@kobato/lexical/comment-schema` comments). The friends grid is NOT a body block — it is the `page.show_friends` toggle.
- Admin body editor: `PageBodyEditor` wraps the inkling composer through the skeleton shared with comments (`@kobato/web-client/editor/editor-surface`); the platform layer owns the composer surface, kobato glue (host cards, `KobatoImageNode`, upload/picker wiring) lives in `ui/editor/`. Inserts use `INSERT_CARD_COMMAND`; host hooks sit under `.kobato-page-editor` in `packages/web/admin/src/styles/inkling-editor.css`. The locale's Inkling label table arrives as root-loader data (`i18n.inklingLabels`), imported by no UI module.
- Editor copy lives in `admin.editor.*`. The entity noun never crosses a shared boundary as text: configs and props carry `entityLabelId` (`UiMessageId`), resolved as `t(entityLabelId, { entity })` in an ICU template. Inkling host-card `menu[].label`/`desc` stay English fallbacks; the locale's table supplies text via `labelKey`.
- The comment composer lives in the public leaf; admin dialogs mount it through `LazyCommentBodyEditor` with `eager` + `focusOnMount`.

## Page draft preview

- `PageDetailBody` takes `draftMarker`: `'draft'`【草稿】, `'unpublished-draft'`【未发布的草稿】, `'published-draft'`【已发布的草稿】, or `null`.

## Page meta toggles

- `page` carries operator-facing booleans (`comments_enabled`, `show_toc`, `show_friends`) edited from `MetaSidebar` and consumed by the public page route as render-time branches — never body mutations. `show_friends` appends the global friends grid below the body; the body format has no `friends` block.
- Adding a toggle touches: db schema + migration + snapshot, page projection, page service + schema, shared DTOs, `MetaSidebar` + `PageEditorShell`, and the `PageMetaDraft`/`PostMetaDraft` types. Test fixtures in `@kobato/web-admin/tests/utils/catalog.ts` and the page service tests need the new default.
