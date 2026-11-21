# `@kobato/assets`

Site-owned asset vocabulary. Owner of: `asset-url` (the ONE asset-URL path grammar — `STORAGE_ROUTE_PREFIX`,
`EMBEDDED_FONT_ROUTE_PREFIX`, `parseAssetUrlPath`, `isOnSiteOrigin`; forward and inverse both derive from it, never
re-implement a fragment), `images` (`AdminImageKind`, `classifyImageKind`, `ResolvedImageMeta`, friend-poster host
paths/retargeting, `siteOwnedStorageSrc`, `getImageUrl` — image URL derivation shared by server and web), `avatar` (the
site-wide avatar URL rule + the `AVATAR_SOURCES` upstream chain vocabulary the comments settings order), `gravatar` (the
mirror-host allowlist, preset URLs, and `isAllowedMirrorUrl` — URL policy only; outbound SSRF/DNS enforcement stays in
the server), `fonts` (`ResolvedFont` / `ResolvedFonts`, the root-loader font payload), and `highlight-languages`
(`HIGHLIGHT_LANGUAGES` code-block vocabulary).

- Allowed deps: none — this is a leaf.
- Bans: no storage backend knowledge (S3/local drivers and the CDN template application live in
  `@kobato/server/src/domains/storage` / `src/infra/storage`); no React.
- Tests: `tests/unit/` (`shared-unit`).
