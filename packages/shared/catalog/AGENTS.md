# `@kobato/catalog`

The public content read model used by SSR, public/admin rendering, and wire output schemas.

- Owns public post/page/taxonomy/friend/comment shapes, listing read models, and projections from richer internal records to public shells/cards/links.
- Does not own oRPC inputs, mutation DTOs, database rows, React, or server queries. `@kobato/contracts` may depend on this package; this package never depends on contracts.
- Allowed deps: `@kobato/lexical` for stored heading/document vocabulary and type-only React Router metadata for listing SEO.
- Tests: `tests/unit/` under `shared-unit`.
