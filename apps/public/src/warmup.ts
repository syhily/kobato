// Route-warmup tier table for the public app (the official frontend). The
// server package keeps the mechanism (`routeWarmupPlugin`); each app owns
// its tier-1 editorial list and tier-2 prefix→bucket mapping here, shared
// by the app's vite.config.ts and the per-app coverage test.
//
// Pure data, zero imports: this module joins the vite config's module graph
// (bundled without the project's resolve aliases), so it must not pull in
// `@kobato/*` specifiers. The tier-2 matcher lives in
// `@kobato/shared/constants/route-warmup` — call it with `TIER2_PREFIXES`.
//
// The four tier-2 buckets are fixed (see `WarmupManifest`); an app simply
// feeds the prefixes it has. The public app has only public routes — its
// admin/editor/auth buckets stay empty by construction.
export const TIER1_ROUTES = ['root', 'routes/public/layout', 'routes/public/home'] as const

// Tier-2 membership is derived from the parsed client manifest's route IDs
// by prefix: `routes/public/` → public. Paginated alias IDs (`home-page`,
// `category-list-page`, …) carry no prefix and are skipped — they share
// their base route's module chunk, which the prefixed base ID already
// collects.
export const TIER2_PREFIXES = [['routes/public/', 'public']] as const
