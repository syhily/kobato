# `@kobato/assets`

Site-owned asset vocabulary. Owner of: `asset-url` (the ONE asset-URL path grammar — `STORAGE_ROUTE_PREFIX`, `EMBEDDED_FONT_ROUTE_PREFIX`, `parseAssetUrlPath`, `isOnSiteOrigin`; forward and inverse both derive from it, never re-implement a fragment), `images` (`AdminImageKind`, `classifyImageKind`, `ResolvedImageMeta`, `siteOwnedStorageSrc`, `getImageUrl` — image URL derivation shared by server and web), `avatar` (the site-wide avatar URL rule + the `AVATAR_SOURCES` upstream chain vocabulary the comments settings order), and `fonts` (`ResolvedFont` / `ResolvedFonts`, the root-loader font payload).

- Allowed deps: none — this is a leaf. Never any other shared leaf or product package.
- Bans: no storage backend knowledge (S3/local drivers and the CDN template application live in `@kobato/server/src/domains/storage` / `src/infra/storage`); no React.
- Tests: `tests/unit/` (umbrella `shared-unit` project — see `packages/shared/tests/AGENTS.md`).
