# Web-kit conventions

`@kobato/web-kit` (`packages/web/kit/`) is the CROSS-SURFACE web package of ADR-0009: the modules BOTH product leaves
render — the root settings contexts and locale sync (`ui/lib`), the shared editor platform, the notifications drawer
family, and the logout (`ui/shared`), plus the audited admin-reuse set (`ui/chrome/BrandLogo` + `use-chrome-clock`, the
comment composer/body modules, `ui/widgets/Image` and its hooks). It exists because the backend app never imports the
public frontend: a module both surfaces need lives HERE, not in either leaf. It may import `@kobato/ui`,
`@kobato/inkling` (barrel), `@kobato/api`, and the shared leaves it declares — but never `@kobato/web-public`,
`@kobato/web-admin`, `@kobato/catalog/seo`, `@kobato/server`, the app, or Node-only APIs. Both leaves import it
(`packages/web/AGENTS.md`).

## Structure

- `shared/` — used by BOTH the public chrome and the admin shell: `notifications/`, `auth/use-logout.ts`, `editor/`.
- `shared/editor/` — the cross-surface editor platform both composers share: `editor-surface` (`useEditorSurface` +
  `EditorSurfaceComposer`, the InklingComposer shell with active-locale labels, word-count language, darkMode),
  `base-node-filter`, `block-quote-aside-cycle`, `use-editor-body-reset`, `inkling-labels`. The page composer is
  consumed by `@kobato/web-admin/ui/editor/PageBodyEditor`, the comment composer by `ui/comments/CommentBodyEditor` here
  — node sets, host cards, uploads, pickers, and copy live beside each consumer.
- `inkling-labels` — the client seam for the Inkling label overlay: WORKSPACE documents read the root loader's
  `i18n.inklingLabels` payload; PUBLIC documents `loadInklingLabels(locale)` — the ONE sanctioned dynamic import of a
  table module. Four locales are four chunks; no static table import anywhere in the client.
- `lib/` — the cross-surface tier the app mounts at the root: `LocaleSyncProvider` (the ROOT cross-tab loop mounted by
  the app's `apps/kobato/src/root.tsx`; contract in the admin settings doc) with its transport `locale-sync.ts`,
  `blog-settings-context.tsx`, and `toast-api-error.ts`.
- `locale-sync` — the cross-tab locale transport: a `BroadcastChannel` announcement, not state; peers reload from the
  server after flushing their own dirty cards and never re-publish. Only a registered settings workspace auto-reloads,
  every other document shows a localized notice with an explicit Reload. A missing/blocked API degrades to a no-op.
- `blog-settings-context` — one context per section (never one bundle context); adding a section = create the context
  and register it in `SECTION_CONTEXTS_ANY`.
- `comments/` — the comment composer half both surfaces mount: `CommentBodyEditor` wraps the inkling composer with the
  trimmed node set (`editor/comment-editor-nodes`), `isEmojiEnabled={false}` / `codeEditor="plain"`; consumers mount
  through `LazyCommentBodyEditor` (composer + inkling island ride a lazy chunk). Comment bodies render the stored
  `content` HTML through `CommentContentHtml` with the `'comment'` sanitize preset. `viewport-zoom-lock.ts` is the
  refcounted iOS lock `useIosNoZoomOnFocus` and the composer both hold.
- `chrome/` — `BrandLogo` (workspace auth screens and the public header share it) and `use-chrome-clock`.
- `widgets/` — `Image` (transformed remote images) with `use-image-loaded` and `use-thumbhash-bg`.

## Styles

`src/styles/` owns the kit's partials (never compiled alone): `kit.css` scans the whole package `../ui` tree and is
composed by BOTH surface entries (`apps/kobato/src/styles/admin.css` directly, `@kobato/web-public/styles/public.css`
transitively); `inkling-comment-editor.css` holds the comment canvas host rules and is imported by `CommentBodyEditor`.
The exact `@source` sets are pinned by `apps/kobato/tests/arch/tailwind-source-ownership.test.ts`.

## Rules

- Production sources are browser-safe (no `node:*` value imports).
- Interface copy is a UI message id resolved through `useI18n()`; icons are named `lucide-react` imports; conditional
  classNames go through `cn()`; JS-driven animation only through the `@kobato/ui/components/lazy-motion` facade with
  constants from `@kobato/ui/lib/motion`.
- Never import `shiki` here — highlighted code arrives pre-rendered (SSR-only).
- Tests live in `packages/web/kit/tests/{unit,snaps}`, run by the umbrella `web-unit`/`web-snaps` projects.
  `tests/utils/render.tsx` is the workspace-canonical web render helper: admin, public, and app test trees import it
  cross-package as `@kobato/web-kit/tests/utils/render` (`tools/test/AGENTS.md`).
