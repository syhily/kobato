# Web-public conventions

`@kobato/web-public` (`packages/web/public/`) is the public-frontend leaf: the public chrome (header/footer/layout), the comment thread and composer, the post body projection and its hydration hooks, widgets, the friends grid, and the two cross-surface tiers. It may import `@kobato/web-client`, `@kobato/ui`, `@kobato/inkling` (barrel), and the shared leaves it declares (`@kobato/{utils,i18n,auth,catalog,settings,assets,sanitize,contracts}` — never `@kobato/seo`; the music player family lives in `@kobato/ui/components/music-player/`). It must NOT import `@kobato/web-admin` (the admin leaf reuses audited modules of THIS package — direction is admin → public, never the reverse) and must NOT import `@kobato/server` or use Node-only APIs. The oRPC client is reached through `@kobato/web-client/api/client`.

## Structure

- `chrome/` — public document chrome (`BaseLayout`, `Header`/`Footer`, `ThemeToggle`, `UserMenu`, …).
- `comments/` — the public comment thread. Thread state is four contexts in `comments-context.ts` (Tree / Identity / ReplySlot / Actions) so leaf rows subscribe to slices. `CommentBodyEditor` wraps the inkling composer with the trimmed node set (`editor/comment-editor-nodes`), `isEmojiEnabled={false}` / `codeEditor="plain"`. Consumers mount through `LazyCommentBodyEditor` (composer + inkling island ride a lazy chunk); the always-visible reply form is interaction-gated, inline forms pass `eager` + `focusOnMount`. A PUBLIC document prefetches the active locale's Inkling label chunk and mounts only after it resolves; focus activations hold the iOS viewport zoom lock. Comment bodies render the stored `content` HTML through `CommentContentHtml` with the narrower `'comment'` sanitize preset; server and client first render both emit the placeholder shell (byte-stable hydration).
- `post/` — bodies render the saved `bodyHtml` projection: `DetailBodyChrome` sanitizes with `sanitizeHtml(html, 'body')`; the five hydration hooks (`useMediumZoom`, `useThumbhashHydration`, `useCodeCopyButtons`, `useMusicPlayers`, `useFootnotePreviews`) all take `bodyHtml` as their re-scan key — the content div is reused across client navigations, so without it the previous article's enhancements leak onto detached nodes.
- `music-player/` — `MusicPlayerCard` hydrates onto `.aplayer[data-*]` mount points via `useMusicPlayers`; its SSR fallback parity is pinned by `tests/unit/ui/music-player/music-player.test.tsx` (root AGENTS → hydration rule).
- `widgets/`, `friends/`, `webmentions/`, `Search.tsx`, `Sidebar.tsx`, `LikeActions.tsx` — public-only leaf modules. Use `<Image />` from `ui/widgets/Image` for transformed remote images.
- `shared/` — used by BOTH the public chrome and the admin shell: `notifications/`, `auth/use-logout.ts`, `music/lrc.ts`. Modules here NEVER import admin modules.
- `lib/` — `LocaleSyncProvider` (the ROOT cross-tab loop mounted by `src/root.tsx`; full contract in the admin settings doc) and `toast-api-error.ts`.

## Styles

`src/styles/` owns the public-surface partials (never compiled alone): `public.css` scans the whole package `../ui` tree; `admin-subset.css` pins the precise per-module subset the admin surface renders; `inkling-comment-editor.css` holds the comment canvas host rules. The exact `@source` sets are pinned by `apps/kobato/tests/arch/tailwind-source-ownership.test.ts`.

## Rules

- Production sources are browser-safe (no `node:*` value imports).
- Interface copy is a UI message id resolved through `useI18n()`; icons are named `lucide-react` imports; conditional classNames go through `cn()`; JS-driven animation only through the `@kobato/ui/components/lazy-motion` facade with constants from `@kobato/web-client/lib/motion`.
- Never import `shiki` here — highlighted code arrives pre-rendered (SSR-only).
- Tests live in `packages/web/public/tests/{unit,snaps}`, run by the umbrella `web (unit)`/`web-snaps` projects.
