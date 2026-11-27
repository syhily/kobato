# UI module conventions

`@kobato/ui` is the design system and the document shell: design tokens, base styles, shadcn/Base UI primitives, static
icons, theme and i18n providers, the document shell, the shared document modules (settings contexts, locale sync, chunk
recovery, `BrandLogo`, `Image`), and generic presentation hooks. Production sources depend only on `@kobato/settings`,
`@kobato/i18n`, `@kobato/utils`, and `@kobato/assets` (`Image`) — never `@kobato/web-kit`, `@kobato/web-admin`, the
public UI tree (`apps/sayaka/src/ui`), or `@kobato/server`.

**`@kobato/ui` imports no `@kobato/api` module** (ADR-0011 §1): a front-end module that calls a procedure is a kit
module or an app's own (`tests/unit/contract/api-free.test.ts`). It imports no React Router either — root route data
reaches the package only as document facts, never through `useRouteLoaderData`.

- `styles/` owns the generic token, typeset, and dark-variant partials plus `ui.css` (`src/styles/AGENTS.md`).
- `components/` contains reusable primitives, not product screens or domain orchestration; a component file never
  defines or exports a hook — a context/hook pair lives in `lib/`.
- `components/document-shell/` is the document shell both app roots mount (`DocumentShell` renders `<html>`: language,
  theme class, font style variables, font links, preconnects, `I18nProvider`, `ChunkReloadOverlay`, and the `head` /
  `bodyEnd` slots the apps fill with React Router's `Meta`/`Links`/`Scripts` and their own document scripts;
  `DocumentProviders` mounts the shared provider stack — `ThemeProvider` → `BlogSettingsProvider` → `LazyMotionConfig` →
  `LocaleSyncProvider` — reading the facts from the shell's context; `document-head.ts` is the pure head planner). Each
  app's root `Layout` maps its loader data to `DocumentFacts` (`lib/document-facts-context`) — the shell never sees
  `content.bootstrap`'s DTO.
- `components/music-player/` is the one sanctioned product-component family (card, lyrics, scrub bar, LRC parser); the
  family is shared by sayaka's projected-body hydration and inkling's host-card preview. SSR fallback parity stays
  pinned consumer-side.
- `components/BrandLogo.tsx` (the light/dark logo pair, used by the public header, the workspace auth screens, and the
  shell's reload overlay) and `components/Image.tsx` (transformed remote images over the settings asset host, with
  `lib/use-image-loaded.ts` and `lib/use-thumbhash-bg.ts`) are the shared document modules that left the kit.
- `lib/document-facts-context.tsx` declares `DocumentFacts` (structural: locale, messages, revision, theme, fonts,
  settings bundle, `nowIso`, CSRF token, label payload), `DocumentFactsProvider`, and `useDocumentFacts()` (throws
  outside the shell). The facts hooks shared modules use instead of reading a route: `lib/use-document-clock.ts`
  (`nowIso`, the hydration-safe document clock), `lib/use-document-csrf-token.ts`, `lib/use-document-labels.ts`.
- `lib/blog-settings-context.tsx` — one context per settings section (never one bundle context); adding a section =
  create the context and register it in `SECTION_CONTEXTS_ANY`.
- `lib/LocaleSyncProvider.tsx` with its transport `lib/locale-sync.ts` — the cross-tab locale announcement: a
  `BroadcastChannel` notice, not state; peers flush their dirty cards through the registered host and reload, every
  other document shows a localized Reload notice. A missing/blocked API degrades to a no-op.
- `lib/chunk-error.ts` (`isChunkLoadError`), `lib/chunk-reload.ts` (the reload store: listeners, the once-per-document
  guard, the `sessionStorage` cooldown), and `components/ChunkReloadOverlay.tsx` (subscribes to the store) are the
  chunk-recovery family each app's `use-chunk-error-recovery` drives.
- `lib/use-music-players.tsx` holds the projected-body hydration hook that mounts `MusicPlayerCard` onto
  `.aplayer[data-*]` mount points over `safeMediaSrc`-gated URLs, with its unit tests under `tests/unit/lib/`.
- `icons/` holds static icon exports; named imports only, never runtime name lookups.
- `lib/` is flat and role-prefixed: `use-*.ts` is a hook, `*Provider.tsx` a provider, `kebab-case-context.tsx` a
  context, `*.ts` a pure helper — `lib/motion.ts` holds the motion presets consumers pass to the `lazy-motion` facade.
  Browser product state and routes belong in the workspace (`packages/web/admin`) and the public app (`apps/sayaka`),
  editor glue in `@kobato/inkling`; the oRPC binding is `@kobato/api/browser`.
- Consumers import directly from `@kobato/ui/<path>`; there is no barrel.
- Preserve SSR/hydration parity and the lazy-motion facade rules.
