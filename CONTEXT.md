# yufan.me

Personal blog/CMS: posts, pages, comments, settings, assets — one admin, one public site.

## Content

**Live**: a post or page that is not soft-deleted, marked published, with a published revision and a
non-future `publishedAt`; direct links work, listings may filter.
_Avoid_: catalog-visible; published (silent about soft-delete, revision, scheduling)

**Promoted**: published with a published revision, whatever the soft-delete state and schedule; the
projection for lifecycle bucketing (draft vs published) and restore re-indexing. Live implies Promoted.
`isPromoted`/`promotedContentWhere` in `src/server/domains/content/schemas/live-gate.ts`, bound per
entity by `promotedPostWhere`.
_Avoid_: live (stricter: adds not-deleted and not-future legs), published (misses the revision)

**Visible**: `visible=false` hides a post from the home page and random-post widgets only; it stays in
archives, tags, search, sitemap, feeds, and direct links. Orthogonal to Live.
_Avoid_: hidden (implies unreachable)

**Content lifecycle**: the single draft→publish revision pipeline owned by content: every body save,
publish, preview, and editor load flows through it. Entity behavior attaches via `posts/descriptor.ts` /
`pages/descriptor.ts`, turned by `entities/` factories into the lifecycle adapter and meta CRUD/mutation
skeleton.
_Avoid_: post draft service / page draft service (dual tracks)

**Scheduled**: published with a future `publishedAt` — not live, 404 until its time.
_Avoid_: future-dated, timed

**Lexical**: the storage format for post/page/comment bodies (`src/shared/lexical/`); public
bodies render the saved `bodyHtml` projection.
_Avoid_: MDX, InklingDocument (vendor experiment, not the shipping store)

**Revision**: one row in the content revision pipeline: every draft save adds a revision with a
monotonic `revisionNo`; publishing points the entity's `publishedRevisionId` at one.
_Avoid_: version (ambiguous with app version), draft (a revision's state)

**Live gate**: `isLive` (in-memory) and `liveContentWhere` (SQL) in
`src/server/domains/content/schemas/live-gate.ts` decide Live; both take `{ asOf, includeScheduled }`;
column binding in `posts/live-gate.ts` / `pages/live-gate.ts`.
_Avoid_: hand-written `published && publishedRevisionId` checks (that is the Promoted gate)

**Draft preview**: viewing non-live content by direct link: authors their own post drafts (admins any
post draft), admins only for page drafts.
_Avoid_: "preview" unqualified (the rule differs per entity), admin-only (never enforced)

**Taxonomy**: a category or tag grouping posts: at most one category (`categoryId`), any number of tags,
admin-edited, undeletable while referenced. List caches are domain-owned; post-count projections in
`posts/services/taxonomy.ts`.
_Avoid_: label, topic; friends (that is the blogroll)

**Branding asset**: a fixed identity image (favicon, logo, OG image, avatars) owned by `domains/assets`
— slot key layouts, per-slot MIME/byte limits, favicon generation, public branding routes.
_Avoid_: "assets" unqualified (the assets Section is storage-backend config)

**Entity-backed card**: a host card whose dataset references a host-owned library row (music `playerId`
→ music row) instead of inline content; it declares a picker through the pick seam, so a pick writes the
reference plus a display meta snapshot. Save-time refresh (`lexical-music-snapshot`) stays authoritative
for server-owned meta keys.
_Avoid_: linked block, embed card (embeds resolve external URLs, not library rows)

**Pick seam**: inkling's channel for a host-owned picker on an entity-backed card: `defineCard` declares
`picker: { render, autoOpenOnInsert? }`; dispatch rides a per-composer request store, and
`CardPickerHostPlugin` mounts `picker.render({ editor, nodeKey, close, fromInsert? })` for the active
request. `useCardPicker().open(nodeKey)` opens it from the card (placeholder click, replace affordance),
the insert registrar on a fresh node. Picks write back by node KEY inside `editor.update()`, never
through a captured node.
_Avoid_: per-card bespoke contexts, picker prop-drilling

## Settings

**Section**: one named slice of the settings bundle (general, assets, mail, security, …); the section
list is the single source for bundle keys, API DTOs, and secret masks — adding one must not require a
second enumeration.
_Avoid_: tab, card, category

**Secret field**: a settings field stored encrypted (mail API keys, storage secret, search API key),
declared once; decrypt-on-load, preserve-on-omit, and masking all derive from it.
_Avoid_: password, credential

**Section patch**: the unit of a settings write — a partial Section payload with the fields one card
owns; the server merges it into the stored section (objects merge, lists replace) and rejects unknown
fields.
_Avoid_: full-section snapshot, loader shape as write base

## Internationalization

**UI locale**: `siteIdentity.locale`, one of `en-US`, `zh-HK`, `zh-TW`, `zh-CN`
(`@/shared/i18n/locales`); drives every system surface (public/admin/auth/editor copy, validation and
error messages, emails, notifications, SEO, feeds, formatting) and is emitted as `<html lang>` /
`Content-Language`; it is never the content's language.
_Avoid_: site language, i18n locale, language code (a tag canonicalized from legacy aliases)

**Content language**: `post.contentLanguage` / `page.contentLanguage`, an optional BCP 47 tag for one
item's prose: author input, never rewritten by UI locale, never detected or translated. Any well-formed
tag is stored canonicalized (`Intl.getCanonicalLocales`, e.g. `ja`, `pt-BR`, `zh-Hant-TW`); `null`/blank
clears; malformed rejects with `admin.editor.contentLanguage.error` at the `contentLanguage` path.
Public detail stamps it as `lang`, unset inherits the UI locale; no copy, title, body bytes, or feed URL
changes.
_Avoid_: treating it as the UI locale, using it to pick a message catalog, an enum of four locales

**Message catalog**: one typed ICU module per locale per namespace — `messages/ui/<locale>` (client
copy, via the root loader) and `messages/server/<locale>` (email, notifications, jobs). English defines
the message-id type, others `satisfies` it; `@/shared/i18n/catalog` aggregates, merges the English
baseline, and validates the ICU contract (variables, argument kinds, legal plural categories, select
coverage). New copy goes into all four locales, never inline.
_Avoid_: translations file, messages JSON (TS modules in the SEA bundle), "just the Chinese strings"

**Time format**: `siteIdentity.timeFormat` — `null` follows the UI locale (Intl short date + short time
in the site time zone); a string is a custom token pattern substituted token-by-token, never handed to
date-fns.
_Avoid_: default date format (`null` IS the default)

**Locale switch**: the General settings language flow, the one control that does not save immediately:
`flushAllAndWait()` over every dirty card → when all are clean, `field.onChange(newLocale)` and
`save('locale')` → one reload if the stored locale changed. A failed flush/commit vetoes the switch,
keeps the unsaved input, never reloads.
_Avoid_: saving the locale first, reloading on a commit failure, a per-field save read as the whole card

## Cache

**Cache declaration**: one named bucket (og, calendar, avatar, imageMeta, searchResult, feed, sitemap,
categories, tags, comments, githubRelease, githubAvatar): metadata in `@/shared/cache/registry` (label,
description, default prefix + TTL, tunable flag), behavior in `@/server/infra/cache/registry` (key
shape, codec, write policy). Consumers use its db-free verbs (`through`, `get`/`set`/`remove`/`clear`,
`throughMany`, generation counters), never `file-store`. Storage is `<storage.data>/cache`; content
invalidates through `invalidateContent(event)`.
_Avoid_: hand-rolled cache-aside, ad-hoc keys outside the behavior plane

**Locale representation**: localized server output keys on the reader dimension AND the settings
generation: `feed`/`calendar` on `locale:APP_VERSION:settingsRevision:<content key>` (calendar adds the
theme), `og` on `settingsRevision:<slug>-<input hash>`, `comments` on `<commentsRevision>:<limit>`,
`sitemap` on its site-origin generation. Responses (plus `manifest.webmanifest`) are
`Cache-Control: public, no-cache` with a strong ETag over the exact served bytes. `settingsRevision` is
the SECTION-SCOPED, content-addressed generation (`shared/config/representation-scopes`): one hash per
`detail`/`listing`/`feed`/`calendar`/`og`/`manifest`/`comments` over exactly the sections that surface
renders (secrets excluded), so unrelated saves or credential rotation move nothing; the boot-unique
`revision` is request identity / locale sync only. Bucket deletes by the
`general`/`content`/`assets`/`sidebar`/`fonts`/`comments` handlers only reclaim orphans; correctness
never depends on them or on waiting for in-flight renders.
_Avoid_: locale-less keys, `max-age` on localized representations, generation counters for those buckets

**Content invalidation**: one door — `invalidateContent(event)` in `@/server/domains/content/invalidate`
— owns the event → side-effect map (post: feed + taxonomy lists + sitemap + search generation; page:
sitemap; category/tag: taxonomy list + whole feed bucket; comment: latest-comments list). Emitted from
repo mutations for comments (two controllers bypass the services), service/lifecycle for posts, pages,
taxonomies.
_Avoid_: cache clears or `bumpCounter` called directly from mutation sites

## Request pipeline

**RequestContext**: the per-request fact base (`src/server/http/request-context.ts`), derived once by
`requestContextMiddleware` and projected — never re-derived — onto Hono `c.var.requestContext`, the oRPC
`HandlerContext` copy, and the React Router `RouterContextProvider` key. It carries the session, viewer,
proxy-aware client address, normalized document URL (`.data`/`_routes`/`index` stripped), request facts,
db/pool handles, CSP nonce, and the PINNED settings bundle plus the `localization` projection (`locale`,
site `timeZone`, `timeFormat`, snapshot `revision`). Both come from ONE lazy snapshot capture
(`createLazyAppSnapshot`), so rendered bytes belong to the revision in their cache key. Same-session
mutations call `markSessionDirty()` and the middleware commits — the only Set-Cookie commit point;
sid-changing flows keep their explicit Set-Cookie channel.
_Avoid_: re-deriving session / URL / client address in a loader, resource, or controller, hand-built
audit literals (use `recordAuditEventFromContext`)

**Viewer**: the session's identity projection — the full `SessionUser` on `RequestContext.viewer`
(`null` when anonymous). Permission predicates in `src/server/domains/auth/rbac.ts` take
`ViewerIdentity { id, role }`, which a `SessionUser` satisfies; audit reads the same shape.
_Avoid_: `viewer.userId` (the field is `id`)

## Structure

**Core domain**: one of the language-backed concepts — `content`, `posts`, `pages`, `pt`, `settings` —
whose terms appear here; changing a core concept (e.g. the Live gate) changes the language itself.
_Avoid_: treating every folder in `domains/` as equally "core"

**Feature domain**: a business feature on the core concepts — `auth`, `users`, `comments`, `taxonomies`,
`images`, `assets`, `fonts`, `music`, `friends`, `newsletter`, `webmentions`. Features compose core
concepts (a comment has a Lexical body) but add no terms to the content language.
_Avoid_: "service" (the platform stratum or a file name, never a feature)

**Platform service**: a technical capability with no domain objects — `analytics`, `audit`, `backup`,
`update`, and the storage migration. Either leaves (import no other domain) or composition points (the
storage migration orchestrates across domains from the admin perimeter); wired by bootstrap/perimeter,
and core/feature domains do not import them except documented wiring (settings rescheduling
audit/backup, auth emitting audit events).
_Avoid_: growing a new cross-domain import INTO a platform service — compose at the perimeter

**Restore machine**: the single owner of a restore job's lifecycle
(`domains/backup/restore-machine.ts`): claim → drain → swap → reopen → validate → complete → release.
Two states: the running job (the slot, claimed atomically by `tryBeginRestore`, released when the chain
finishes) and the terminal report (consumed once by the status projection). Engine specifics are
injected once by the composition root via `wireRestoreMachine`; routes pass a buffer, never handles or
phase names. The `complete` recovery policy — rollback → reopen → reschedule → migrate → ANALYZE →
restart, including the never-restart-into-a-dead-handle invariant — lives in
`domains/backup/restore-completion.ts`, built by `createRestoreCompletion`.
_Avoid_: restore orchestrator
