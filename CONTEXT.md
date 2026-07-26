# yufan.me

Personal blog/CMS: posts, pages, comments, settings, assets — one admin, one public site.

## Language

### Content

**Live**:
A post or page is live when it is not soft-deleted, is marked published, has a
published revision attached, and its `publishedAt` is not in the future. Live
content is reachable by direct link; listing surfaces may filter further.
_Avoid_: catalog-visible (retired `isCatalogVisible`), published (overloaded —
says nothing about soft-delete, revision, or scheduling)

**Promoted**:
A post or page is promoted when it is marked published and has a published
revision attached, regardless of soft-delete state and scheduling. Promoted is
the projection used by lifecycle bucketing (draft vs published) and restore
re-indexing; Live implies Promoted, not the reverse. Its paired projections
are `isPromoted` (in-memory) and `promotedContentWhere` (SQL) in
`src/server/domains/content/schema.ts`, bound per entity by
`promotedPostWhere`.
_Avoid_: live (stricter — adds the not-deleted and not-future legs),
published (overloaded — the bare flag misses the required published revision)

**Visible**:
A post flag controlling _listing_ only: `visible=false` hides the post from the
home page and random-post widgets, but it stays in archives, tags, search,
sitemap, and feeds, and stays reachable by direct link. Orthogonal to Live.
_Avoid_: hidden (implies unreachable — it is not)

**Content lifecycle**:
The single draft→publish revision pipeline owned by the content domain. Every
post/page body save, publish, preview, and editor load flows through it;
post- and page-specific behavior attaches at its seams.
_Avoid_: post draft service / page draft service (retired dual tracks)

**Scheduled**:
Live-in-the-future content: published with a `publishedAt` later than now.
Scheduled content is not live and answers 404 until its time arrives.
_Avoid_: future-dated, timed

**PT**:
The strict PortableText subset that is this repo's wire and storage format
for rich content, stored in `content.body` and `comment.body` (`jsonb`) and
defined in `src/shared/pt/schema.ts`. The Tiptap editor round-trips through a
bridge so the editor JSON and the PT wire format stay losslessly isomorphic;
the `pt` directories (`src/shared/pt`, `src/ui/pt`, `src/server/infra/pt`,
`src/server/domains/pt`) hold its schema, renderer, and services.
_Avoid_: MDX (retired render target), InklingDocument (editor-vendor
experiment, not the shipping store)

**Revision**:
One row in the content table's revision pipeline: every draft save creates a
new revision with a monotonically increasing `revisionNo`; publishing promotes
a revision by pointing the entity's `publishedRevisionId` at it. The
draft→publish revision pipeline is the Content lifecycle (q.v.), and "the
published revision" is what makes content Live.
_Avoid_: version (ambiguous with app version), draft (a revision's state,
not the revision itself)

**Live gate**:
The paired projections `isLive` (in-memory) and `liveContentWhere` (SQL) in
`src/server/domains/content/schema.ts` that decide whether a row satisfies
Live. Both take the same `{ asOf, includeScheduled }` options; entity column
binding lives in repo-side adapters (`livePostWhere` / `livePageWhere`).
_Avoid_: hand-written `published && publishedRevisionId` checks (that's the
Promoted gate (q.v.) — route them through its projections instead)

**Draft preview**:
Viewing non-live content by direct link. Deliberate per-entity policy:
authors may preview post drafts; only admins may preview page drafts.
_Avoid_: "preview" without an entity qualifier (the rule differs per
entity), admin-only (the stale claim the code never enforced)

### Settings

**Section**:
One named slice of the settings bundle (general, assets, mail, security, …).
The section list is the single source from which bundle keys, API DTOs, and
secret masks are derived — adding a section must not require editing a second
enumeration.
_Avoid_: tab, card, category

**Secret field**:
A settings field stored encrypted (mail API keys, storage secret, search API
key). Declared once; decrypt-on-load, preserve-on-omit, and masking all derive
from that single declaration.
_Avoid_: password, credential

**Section patch**:
The unit of a settings write: a partial Section payload carrying only the
fields one card owns. The server merges it against the stored section
(objects merge, lists replace) instead of trusting a client-assembled full
snapshot; unknown fields are rejected.
_Avoid_: full-section snapshot, loader shape as write base

### Cache

**Cache declaration**:
One named `kv_cache` bucket (og, calendar, avatar, imageMeta,
embeddingSearch, searchResult, feed, sitemap, categories, tags,
comments). Declared once in `@/shared/cache/registry` (metadata plane:
label, description, default prefix + TTL, tunable flag); the behavior
plane (`@/server/infra/cache/registry`) attaches the key shape, codec,
and write policy, and every consumer goes through its verbs (`through`,
`get`/`set`/`remove`/`clear`, `throughMany`, generation counters) — never
through `kv-store` directly.
_Avoid_: hand-rolled cache-aside at call sites, ad-hoc key strings
outside the behavior plane

**Content invalidation**:
One door — `invalidateContent(db, event)` in
`@/server/domains/content/invalidate` — owns the event → side-effect
mapping (post: feed + taxonomy lists + sitemap + search generation; page:
sitemap; category/tag: taxonomy list + whole feed bucket; comment:
latest-comments list). Emission layer: repo mutations for comments (two
controllers call the repos directly, bypassing the services),
service/lifecycle for posts, pages, and taxonomies.
_Avoid_: calling cache clears or `bumpCounter` directly from mutation
sites

### Request pipeline

**RequestContext**:
The canonical per-request fact base (`src/server/http/request-context.ts`),
derived exactly once per request by `requestContextMiddleware` and
projected — never re-derived — onto the three context surfaces: Hono
`c.var.requestContext`, the oRPC `HandlerContext` field copy, and the
React Router `RouterContextProvider` key. It carries the session, the
viewer, the proxy-aware client address, the normalized document URL
(`.data` / `_routes` / `index` stripped), the request facts, the
db/pool handles, and the CSP nonce. Same-session mutations call
`markSessionDirty()` and the middleware commits — the only Set-Cookie
commit point; sid-changing flows (login rotation) keep their explicit
Set-Cookie channel.
_Avoid_: re-deriving the session / URL / client address in a loader,
resource, or controller (read the projection), hand-built audit context
literals (use `recordAuditEventFromContext`)

**Viewer**:
The session's identity projection — the full `SessionUser` on
`RequestContext.viewer` (`null` when anonymous). Permission predicates in
`src/server/domains/auth/rbac.ts` take the structural minimum
`ViewerIdentity { id, role }`, which a `SessionUser` satisfies; the audit
trail reads the same shape.
_Avoid_: `ViewerContext` (retired), `viewer.userId` (the field is `id`)
