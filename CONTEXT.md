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
`src/server/domains/content/schemas/live-gate.ts`, bound per entity by
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
post- and page-specific behavior attaches through the entity's
`descriptor.ts` (`posts/descriptor.ts`, `pages/descriptor.ts`), which the
content domain's `entities/` factories turn into the lifecycle adapter and
the meta CRUD/mutation skeleton.
_Avoid_: post draft service / page draft service (retired dual tracks)

**Scheduled**:
Live-in-the-future content: published with a `publishedAt` later than now.
Scheduled content is not live and answers 404 until its time arrives.
_Avoid_: future-dated, timed

**PT**:
The legacy PortableText subset that typed rich content before the inkling
migration, defined in `src/shared/pt/schema.ts`. Lexical editor states are
the live storage format (`src/shared/lexical/`); the R15 boot backfill
converts every pre-switch row on upgrade, so PT survives only as the legacy
schema/utils feeding the converter and the dual-path legacy fallbacks
(comment email/plain-text helpers, the asset-URL backfill). The PT SSR
renderer and enriched-body overlay were retired in R13 — public bodies
render the saved `bodyHtml` projection.
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
`src/server/domains/content/schemas/live-gate.ts` that decide whether a row satisfies
Live. Both take the same `{ asOf, includeScheduled }` options; entity column
binding lives in the post-/page-table bindings (`posts/live-gate.ts` /
`pages/live-gate.ts`).
_Avoid_: hand-written `published && publishedRevisionId` checks (that's the
Promoted gate (q.v.) — route them through its projections instead)

**Draft preview**:
Viewing non-live content by direct link. Deliberate per-entity policy:
authors may preview post drafts; only admins may preview page drafts.
_Avoid_: "preview" without an entity qualifier (the rule differs per
entity), admin-only (the stale claim the code never enforced)

**Taxonomy**:
A category or tag used to group posts. A post has at most one category
(`categoryId`) and any number of tags; both are edited from the admin
and cannot be deleted while a post still references them. The taxonomy
domains own their list caches; the post-count projections live on the
posts surface (`posts/services/taxonomy.ts`).
_Avoid_: label, topic; lumping friends in — friends is the blogroll
feature, not a taxonomy

**Branding asset**:
One of the site's fixed identity images (favicon, logo, OG image,
avatars), owned by `domains/assets` — slot key layouts, per-slot
MIME/byte limits, favicon generation, the public branding routes.
_Avoid_: "assets" unqualified — the `assets` Section (q.v.) is the
storage-backend configuration (S3 toggle, credentials, upload limits,
CDN host), a different concept that happens to share the name

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
searchResult, feed, sitemap, categories, tags, comments,
githubRelease, githubAvatar). Declared once in `@/shared/cache/registry` (metadata plane:
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

### Structure

**Core domain**:
One of the language-backed concepts — `content`, `posts`, `pages`,
`pt`, `settings` — whose terms appear in this file. Core domains are
where the product's vocabulary lives; a change to a core concept
(e.g. the Live gate) is a change to the language itself.
_Avoid_: treating every folder in `domains/` as equally "core"

**Feature domain**:
A business feature built on the core concepts — `auth`, `users`,
`comments`, `taxonomies`, `images`, `assets`, `fonts`, `music`,
`friends`, `newsletter`, `webmentions`. Features compose core concepts
(a comment has a Lexical body; a taxonomy groups posts) but add no terms to
the content language.
_Avoid_: "service" (that's the platform stratum or a file name, never
a feature)

**Platform service**:
A technical capability with no domain objects of its own — `analytics`,
`audit`, `backup`, `update`, and the storage migration. Platform
services are either leaves (import no other domain: analytics, audit,
backup, update) or composition points (the storage migration
orchestrates across domains from the admin perimeter). They are wired
by bootstrap/perimeter; core and feature domains do not import them,
except documented explicit wiring (settings rescheduling audit/backup,
auth emitting audit events).
_Avoid_: growing a new cross-domain import INTO a platform service —
compose at the perimeter instead

**Restore machine**:
The single owner of a restore job's lifecycle
(`domains/backup/restore-machine.ts`): claim → drain → swap → reopen →
validate → complete → release. Two separate states: the running job
(the slot, claimed atomically by `tryBeginRestore`, released when the
chain finishes) and the terminal report (consumed once by the status
projection). Engine specifics (flush/close/reopen) are injected once by
the composition root via `wireRestoreMachine`; routes pass a buffer,
never handles or phase names. The `complete` step's recovery policy —
rollback → reopen → reschedule → migrate → ANALYZE → restart, including
the never-restart-into-a-dead-handle invariant — lives in the backup
domain too (`domains/backup/restore-completion.ts`), built by
`createRestoreCompletion` over composition-root-injected engine access.
_Avoid_: restore orchestrator (retired — the chain was split across
lifecycle/orchestrator/db-lifecycle/routes before consolidation)
