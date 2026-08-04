// Route-warmup tier table for the core app (admin SSR + /rpc + /api + URL
// endpoints). The server package keeps the mechanism (`routeWarmupPlugin`);
// each app owns its tier-1 editorial list and tier-2 prefix→bucket mapping
// here, shared by the app's vite.config.ts and the per-app coverage test.
//
// Pure data, zero imports: this module joins the vite config's module graph
// (bundled without the project's resolve aliases), so it must not pull in
// `@kobato/*` specifiers. The tier-2 matcher lives in
// `@kobato/shared/constants/route-warmup` — call it with `TIER2_PREFIXES`.
//
// The four tier-2 buckets are fixed (see `WarmupManifest`); an app simply
// feeds the prefixes it has. Core has no public routes — every route below
// lands in admin/editor/auth or tier 1.
export const TIER1_ROUTES = ['root', 'routes/admin/layout', 'routes/admin/dashboard'] as const

// Tier-2 membership is derived from the parsed client manifest's route IDs
// by prefix. Core routes are admin/editor/auth only; paginated alias IDs
// (`home-page`, `category-list-page`, …) are a public-app concept and do not
// appear here.
export const TIER2_PREFIXES = [
  ['routes/admin/', 'admin'],
  ['routes/editor/', 'editor'],
  ['routes/auth/', 'auth'],
] as const
