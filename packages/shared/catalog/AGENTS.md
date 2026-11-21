# `@kobato/catalog`

The public content read model and public presentation metadata used by SSR, public/admin rendering, wire output schemas,
and the server's feed/OG renderers.

- `model.ts` owns the public post/page/taxonomy/friend/comment shapes, listing-card/detail-shell read models, and the
  richer `Post`/`Page` catalog records (`bodyHtml`/`bodyState`/`imageSources`/revision columns).
- `projection.ts` owns the pure `toClientPost` / `toListingPostCard` / `toDetailPostShell` / `toDetailPageShell` /
  `toSidebarPostLink` projections from catalog records to public shapes.
- `listing.ts` owns the route-level listing loader data (SEO metadata + request identity).
- `seo/` is a documented layer (the two-module exception to the three-sibling rule): `meta.ts` builds route meta
  (`routeMeta` / `metaWithFallback` / `bundleFromMatches` / `i18nFromMatches` / `seoForPost` / `seoForPage` /
  `pageTitle`) over the root loader's `matches` + its `i18n` payload, falling back to the hydrated settings bundle and
  the shared fallback messages; `og-image.ts` owns the OG image path grammar (`ogImagePathForSlug`). It lives here — not
  in the app — because the server's feed/OG renderers import it, and the dependency direction is app → server.
  Consumers: the app's routes and `src/seo/title-meta`, plus the server's feed/OG renderers. web-admin and web-public
  never import it directly — route title resolution stays in the app layer.
- Does not own oRPC inputs, mutation DTOs, database rows, React, or server queries. `@kobato/api` (the wire schemas) may
  depend on this package; this package never depends on the api contracts.
- Allowed deps: `@kobato/settings`, `@kobato/i18n`, `@kobato/utils` (values), `@kobato/inkling` (headless, TYPE-ONLY:
  `LexicalEditorState` / `MarkdownHeading`) and type-only React Router metadata (`MetaDescriptor` arrives as an erased
  `import type`, not a React import). Runtime-isomorphic and React-free like every shared leaf.
- Tests: `tests/unit/` + `tests/snaps/` (`shared-unit` / `shared-snaps`). The workspace-canonical content fixture lives
  in `@kobato/api/tests/utils/catalog.ts` because it also builds wire DTOs; catalog never depends on the api contracts.
