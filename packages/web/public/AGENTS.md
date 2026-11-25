# Web-public conventions

`@kobato/web-public` (`packages/web/public/`) is the lower product-frontend leaf: public chrome, the comment thread and
composer, the post body projection and its hydration hooks, widgets, the friends grid, and the modules BOTH product
leaves share (the `ui/shared`/`ui/lib` tiers, the root settings contexts). It may import `@kobato/ui`, `@kobato/inkling`
(barrel), and the shared leaves it declares — but never `@kobato/catalog/seo` (route title/meta resolution lives in the
app layer); wire DTOs come from `@kobato/api/contracts`; the music player family lives in
`@kobato/ui/components/music-player/`. It must NOT import `@kobato/web-admin`, `@kobato/server`, the app, or Node-only
APIs. The oRPC client is reached through `@kobato/api/browser/client` (`packages/web/AGENTS.md`).

## Structure

- `chrome/` — public document chrome (`BaseLayout`, `Header`/`Footer`, `ThemeToggle`, `UserMenu`, …), plus the
  chunk-recovery pair the app's document hooks drive: `chunk-error.ts` (the `isChunkLoadError` predicate) and
  `chunk-reload.ts` (the reload store — listeners, the once-per-document guard, the `sessionStorage` cooldown — that
  `ChunkReloadOverlay` subscribes to).
- `comments/` — the public comment thread. Thread state is four contexts in `comments-context.ts` (Tree / Identity /
  ReplySlot / Actions) so leaf rows subscribe to slices. `CommentBodyEditor` wraps the inkling composer with the trimmed
  node set (`editor/comment-editor-nodes`), `isEmojiEnabled={false}` / `codeEditor="plain"`. Consumers mount through
  `LazyCommentBodyEditor` (composer + inkling island ride a lazy chunk); the always-visible reply form is
  interaction-gated, inline forms pass `eager` + `focusOnMount`. A PUBLIC document prefetches the active locale's
  Inkling label chunk and mounts only after it resolves; focus activations hold the iOS viewport zoom lock. Comment
  bodies render the stored `content` HTML through `CommentContentHtml` with the `'comment'` sanitize preset; server and
  client first render both emit the placeholder shell (byte-stable hydration). Two modules here are shared with the
  app's document hooks: `viewport-zoom-lock.ts` (the refcounted iOS lock `useIosNoZoomOnFocus` and the composer both
  hold) and `comment-item/comment-flash.ts` (the highlight store the focus-hash hook flashes and `CommentRow` subscribes
  to).
- `post/` — bodies render the saved `bodyHtml` projection: `DetailBodyChrome` sanitizes with
  `sanitizeHtml(html, 'body')`; the five hydration hooks (`useMediumZoom`, `useThumbhashHydration`,
  `useCodeCopyButtons`, `useMusicPlayers`, `useFootnotePreviews`) all take `bodyHtml` as their re-scan key — the content
  div is reused across client navigations. `MusicPlayerCard` (in `@kobato/ui/components/music-player/`) hydrates onto
  `.aplayer[data-*]` mount points via `useMusicPlayers`; SSR fallback parity is pinned by
  `tests/unit/ui/music-player/music-player.test.tsx`.
- `widgets/`, `friends/`, `webmentions/`, `Search.tsx`, `Sidebar.tsx`, `LikeActions.tsx` — public-only leaf modules.
- `shared/` — used by BOTH the public chrome and the admin shell: `notifications/`, `auth/use-logout.ts`, `editor/`.
  Modules here NEVER import admin modules.
- `shared/editor/` — the cross-surface editor platform both composers share: `editor-surface` (`useEditorSurface` +
  `EditorSurfaceComposer`, the InklingComposer shell with active-locale labels, word-count language, darkMode),
  `base-node-filter`, `block-quote-aside-cycle`, `use-editor-body-reset`, `inkling-labels`. The page composer is
  consumed by `@kobato/web-admin/ui/editor/PageBodyEditor`, the comment composer by
  `@kobato/web-public/ui/comments/CommentBodyEditor` — node sets, host cards, uploads, pickers, and copy live beside
  each consumer.
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

## Styles

`src/styles/` owns the public-surface partials (never compiled alone): `public.css` scans the whole package `../ui`
tree; `admin-subset.css` pins the precise per-module subset the admin surface renders; `inkling-comment-editor.css`
holds the comment canvas host rules. The exact `@source` sets are pinned by
`apps/kobato/tests/arch/tailwind-source-ownership.test.ts`.

## Rules

- Production sources are browser-safe (no `node:*` value imports).
- Interface copy is a UI message id resolved through `useI18n()`; icons are named `lucide-react` imports; conditional
  classNames go through `cn()`; use `<Image />` from `ui/widgets/Image` for transformed remote images; JS-driven
  animation only through the `@kobato/ui/components/lazy-motion` facade with constants from `@kobato/ui/lib/motion`.
- Never import `shiki` here — highlighted code arrives pre-rendered (SSR-only).
- Tests live in `packages/web/public/tests/{unit,snaps}`, run by the umbrella `web-unit`/`web-snaps` projects.
  `tests/utils/render.tsx` is the workspace-canonical web render helper: admin and app test trees import it
  cross-package as `@kobato/web-public/tests/utils/render`.
