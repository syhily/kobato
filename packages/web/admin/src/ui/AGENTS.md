# UI conventions

`packages/web/admin/src/ui/` is the ADMIN product layer: admin components plus domain controllers. Reusable product
orchestration (list/filter controllers, editor shells, draft persistence, uploads) lives HERE beside its consumers;
route modules wire loader data and hold no reusable orchestration. Leaf presentation components are explicit-props — no
reads from sessions, route params, request objects, or env vars.

## Component tiers

- **`@kobato/ui/components`** — external design-system primitives, flat so `npx shadcn@latest add/diff` works;
  `components.json` points there.
- **`@kobato/web-public/ui/shared` + `ui/lib`** — the cross-surface tiers; new cross-surface modules go THERE, never
  into this package.
- `ui/shared/` — cross-domain modules (`list/`, `filter-bar/`, `image-edit/`, `form/`); only genuinely multi-domain
  modules stay at the root (`ConfirmDialog`, `sortable.tsx`, `mask.ts`, `SearchShortcutHint`, `use-file-upload.ts`).
  - `useFileUpload` owns file/field guards, typed-oRPC submission, error unwrap, and toast choreography — never
    hand-roll a fetch upload. Backup's progress XHR is the sole transport exception and still uses the API package's
    standard RPC serializer. Hooks running under the React tree read `useI18n()` themselves; hooks callable from
    non-React entries take the caller's `t`.
  - `sortable.tsx` is the one dnd-list adapter (`useSortableRow` — destructure its result; member access trips the
    react-compiler ref heuristic). New sortable lists use it.
- `editor/` — the page-body composer glue: `PageBodyEditor` (the only module other admin domains import), `pickers/`,
  `lexical-body-diff.tsx`, plus the platform consumers — `page-editor-nodes` (mounted types must stay inside
  `FULL_EDITOR_NODE_TYPES`, contract-tested), `image-insert-override`, `image-library-pick`, `page-editor-upload`
  (uploads through `orpc.admin.images.upload`), `page-editor-card-config` + `render-math` (factories taking the
  translator; `resolveMathError` turns the server's error descriptor into the single string Inkling accepts — a raw
  catalog key never reaches the editor), `use-focus-mode`, and `music-card-picker.tsx` (registers the picker dialog at
  module scope — the dialog is host data flow over RPC). Decorate chrome and `exportDOM` markup share the spec's
  constants; parity pinned by `packages/web/admin/tests/unit/ui/editor/cards/`. Spec `menu[].label`/`desc` are English
  fallbacks; the slash menu localizes through `labelKey`, card chrome reads `admin.editor.cards.*`.
- `editor-shell/` — draft/publish orchestration: `useEditorShellState` orchestrates both shells (extend it, never add
  shared state); `useEditorShellPersist` owns save-flow status + baselines in sibling slices with pure planners in
  `editor-shell-persist-plan.ts`; `useAutosave` is the sole baseline owner behind `setBaseline`;
  `Post/PageEditorShell.tsx` are config-only; `Post/PageEditorRoute.tsx` delegate to `EditorRouteLoader`.
- `editor-meta/` — the post/page meta form family (presentation/controllers only); `account/`, `music/` (+
  `music/player/`), `branding/` — product domains; `settings/` has its own AGENTS.md.

## Cross-cutting

- Admin's reuse of public modules stays on the audited set pinned by `ADMIN_PUBLIC_IMPORTS` in
  `apps/kobato/tests/arch/web-direction.test.ts`.
- `@kobato/ui/lib` owns `cn`, `code-languages`, `I18nProvider`, `ThemeProvider`, and generic presentation hooks.

## Merge-engine tokens

`cn.ts` extends every project token namespace so custom `--text-*` / `--color-*` / `--shadow-*` tokens land in the
correct merge group.

- A new `--<namespace>-<name>` token in `tailwind.css` MUST pair with an entry in `cn.ts`'s per-namespace list
  (`packages/ui/tests/unit/contract/tailwind-tokens.test.ts`).
- Never write `dark:bg-foo` on a tier-1 token — the `.dark` rebind handles the switch. Adjacent dark surface tiers stay
  3–8 L apart; no `--line-*` token shares a value with a `--surface-*` token.

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
- Animation is Motion Only: the `@kobato/ui/components/lazy-motion` facade with constants from
  `@kobato/web-client/lib/motion` (root `AGENTS.md` holds the full rule).
- Use `<Image />` from `@kobato/web-public/ui/widgets/Image` for transformed remote images.
- **Shiki is SSR-only** — never import `shiki`/`@shikijs/*` here (Oniguruma `.wasm` violates the strict CSP);
  highlighted code arrives pre-rendered.
- Stateful orchestrators aim for ≤500 LOC per file; past that, extract.

## Content editors

- Storage: Lexical states (`@kobato/inkling/headless/schema` posts/pages, `comment-schema` comments). The friends grid
  is the `page.show_friends` toggle, not a body block.
- `PageBodyEditor` wraps the inkling composer through the skeleton shared with comments
  (`@kobato/web-client/editor/editor-surface`); kobato glue (host cards, `KobatoImageNode`, upload/picker wiring) lives
  in `ui/editor/`. Host hooks sit under `.kobato-page-editor` in `packages/web/admin/src/styles/inkling-editor.css`. The
  locale's Inkling label table arrives as root-loader data (`i18n.inklingLabels`), imported by no UI module.
- Editor copy lives in `admin.editor.*`. The entity noun never crosses a shared boundary as text: configs carry
  `entityLabelId` (`UiMessageId`) resolved via ICU `select`. The comment composer lives in the public leaf; admin
  dialogs mount it through `LazyCommentBodyEditor` with `eager` + `focusOnMount`.

## Page meta toggles

- `page` carries operator-facing booleans (`comments_enabled`, `show_toc`, `show_friends`) edited from `MetaSidebar` and
  consumed as render-time branches — never body mutations.
- Adding a toggle touches: db schema + migration + snapshot, page projection, page service + schema, shared DTOs,
  `MetaSidebar` + `PageEditorShell`, the `PageMetaDraft`/`PostMetaDraft` types, and the catalog/service test fixtures.
