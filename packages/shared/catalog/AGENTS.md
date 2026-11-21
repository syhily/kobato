# `@kobato/catalog`

The public content read model used by SSR, public/admin rendering, and wire output schemas.

- `model.ts` owns the public post/page/taxonomy/friend/comment shapes, listing-card/detail-shell read models, and the
  richer `Post`/`Page` catalog records (`bodyHtml`/`bodyState`/`imageSources`/revision columns).
- `projection.ts` owns the pure `toClientPost` / `toListingPostCard` / `toDetailPostShell` / `toDetailPageShell` /
  `toSidebarPostLink` projections from catalog records to public shapes.
- `listing.ts` owns the route-level listing loader data (SEO metadata + request identity).
- Does not own oRPC inputs, mutation DTOs, database rows, React, or server queries. `@kobato/api` (the wire schemas) may
  depend on this package; this package never depends on the api contracts.
- Allowed deps: `@kobato/inkling` (headless, TYPE-ONLY: `LexicalEditorState` / `MarkdownHeading`) and type-only React
  Router metadata for listing SEO.
- Tests: `tests/unit/` (`shared-unit`). The workspace-canonical content fixture lives in
  `@kobato/api/tests/utils/catalog.ts` because it also builds wire DTOs; catalog never depends on the api contracts.
