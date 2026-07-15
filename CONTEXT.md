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
