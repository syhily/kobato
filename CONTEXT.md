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
_Avoid_: hand-written `published && publishedRevisionId` checks (drifted
copies of this gate)

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
