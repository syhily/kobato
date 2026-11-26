# Web-public conventions

`@kobato/web-public` (`packages/web/public/`) is the lower product-frontend leaf: public chrome, the comment thread, the
post body projection and its hydration hooks, widgets, the friends grid. The modules BOTH product leaves render — the
`ui/shared`/`ui/lib` tiers, the comment composer and body projection, `BrandLogo`, `Image` — live in `@kobato/web-kit`,
which this leaf imports. It may also import `@kobato/ui`, `@kobato/inkling` (barrel), and the shared leaves it declares
— but never `@kobato/catalog/seo` (route title/meta resolution lives in the app layer); wire DTOs come from
`@kobato/api/contracts`; the music player family lives in `@kobato/ui/components/music-player/`. It must NOT import
`@kobato/web-admin`, `@kobato/server`, the app, or Node-only APIs. The oRPC client is reached through
`@kobato/api/browser/client` (`packages/web/AGENTS.md`).

## Structure

- `chrome/` — public document chrome (`BaseLayout`, `Header`/`Footer`, `ThemeToggle`, `UserMenu`, …), plus the
  chunk-recovery pair the app's document hooks drive: `chunk-error.ts` (the `isChunkLoadError` predicate) and
  `chunk-reload.ts` (the reload store — listeners, the once-per-document guard, the `sessionStorage` cooldown — that
  `ChunkReloadOverlay` subscribes to).
- `comments/` — the public comment thread. Thread state is four contexts in `comments-context.ts` (Tree / Identity /
  ReplySlot / Actions) so leaf rows subscribe to slices. The composer (`CommentBodyEditor`) and the body projection
  (`CommentContentHtml`) live in `@kobato/web-kit`; the always-visible reply form here is interaction-gated, inline
  forms pass `eager` + `focusOnMount` to the kit's `LazyCommentBodyEditor`. A PUBLIC document prefetches the active
  locale's Inkling label chunk and mounts only after it resolves; focus activations hold the iOS viewport zoom lock.
  Server and client first render both emit the placeholder shell (byte-stable hydration). One module here is shared with
  the app's document hooks: `comment-item/comment-flash.ts` (the highlight store the focus-hash hook flashes and
  `CommentRow` subscribes to).
- `post/` — bodies render the saved `bodyHtml` projection: `DetailBodyChrome` sanitizes with
  `sanitizeHtml(html, 'body')`; the five hydration hooks (`useMediumZoom`, `useThumbhashHydration`,
  `useCodeCopyButtons`, `useMusicPlayers`, `useFootnotePreviews`) all take `bodyHtml` as their re-scan key — the content
  div is reused across client navigations. `MusicPlayerCard` (in `@kobato/ui/components/music-player/`) hydrates onto
  `.aplayer[data-*]` mount points via `useMusicPlayers`; SSR fallback parity is pinned by
  `tests/unit/ui/music-player/music-player.test.tsx`.
- `widgets/`, `friends/`, `webmentions/`, `Search.tsx`, `Sidebar.tsx`, `LikeActions.tsx` — public-only leaf modules.

## Styles

`src/styles/` owns the public-surface partial (never compiled alone): `public.css` scans the whole package `../ui` tree
and composes `@kobato/web-kit/styles/kit.css` so the public compile covers the kit modules it renders. The exact
`@source` sets are pinned by `apps/kobato/tests/arch/tailwind-source-ownership.test.ts`.

## Rules

- Production sources are browser-safe (no `node:*` value imports).
- Interface copy is a UI message id resolved through `useI18n()`; icons are named `lucide-react` imports; conditional
  classNames go through `cn()`; use `<Image />` from `@kobato/web-kit/ui/widgets/Image` for transformed remote images;
  JS-driven animation only through the `@kobato/ui/components/lazy-motion` facade with constants from
  `@kobato/ui/lib/motion`.
- Never import `shiki` here — highlighted code arrives pre-rendered (SSR-only).
- Tests live in `packages/web/public/tests/{unit,snaps}`, run by the umbrella `web-unit`/`web-snaps` projects. The
  workspace-canonical web render helper lives in `@kobato/web-kit/tests/utils/render`.
