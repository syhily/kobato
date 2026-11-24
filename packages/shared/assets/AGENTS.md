# `@kobato/assets`

Site-owned asset vocabulary: `asset-url` (the ONE asset-URL path grammar — `STORAGE_ROUTE_PREFIX`,
`EMBEDDED_FONT_ROUTE_PREFIX`, `parseAssetUrlPath`, `isOnSiteOrigin`; forward and inverse both derive from it, never
re-implement a fragment), `images` (image kinds, friend-poster host paths/retargeting, `siteOwnedStorageSrc`,
`getImageUrl`), `avatar` (site-wide avatar rule + the `AVATAR_SOURCES` chain), `gravatar` (mirror-host allowlist, preset
URLs, `isAllowedMirrorUrl` — URL policy only; SSRF/DNS enforcement stays in the server), `fonts` (`ResolvedFont(s)`, the
root-loader font payload), `highlight-languages` (`HIGHLIGHT_LANGUAGES`).

- Allowed deps: none. No storage backend knowledge (drivers and the CDN template live in
  `@kobato/server/src/domains/storage` / `src/infra/storage`); no React.
- Tests: `tests/unit/` (`shared-unit`).
