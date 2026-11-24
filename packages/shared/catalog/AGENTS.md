# `@kobato/catalog`

The public content read model and presentation metadata used by SSR, public/admin rendering, wire output schemas, and
the server's feed/OG renderers.

- `model.ts` — public post/page/taxonomy/friend/comment shapes, listing-card/detail-shell read models, and the richer
  `Post`/`Page` catalog records (`bodyHtml`/`bodyState`/`imageSources`/revision columns).
- `projection.ts` — pure `toClientPost` / `toListingPostCard` / `toDetailPostShell` / `toDetailPageShell` /
  `toSidebarPostLink` projections.
- `listing.ts` — route-level listing loader data (SEO metadata + request identity).
- `seo/` (a documented layer, the two-module exception to the three-sibling rule): `meta.ts` builds route meta over the
  root loader's `matches` + `i18n` payload, falling back to the hydrated settings bundle and the shared fallback
  messages; `og-image.ts` owns the OG image path grammar (`ogImagePathForSlug`). Consumers: the app's routes and
  `src/seo/`, plus the server's feed/OG renderers. web-admin and web-public never import it — route title resolution
  stays in the app layer.
- Does not own oRPC inputs, mutation DTOs, database rows, React, or server queries; never depends on the api contracts.
- Allowed deps: `@kobato/settings`, `@kobato/i18n`, `@kobato/utils` (values); `@kobato/inkling` (headless, TYPE-ONLY)
  and `MetaDescriptor` (type-only). Runtime-isomorphic and React-free like every shared leaf.
- Tests: `tests/unit/` + `tests/snaps/` (`shared-unit` / `shared-snaps`). The workspace-canonical content fixture lives
  in `@kobato/api/tests/utils/catalog.ts`.
