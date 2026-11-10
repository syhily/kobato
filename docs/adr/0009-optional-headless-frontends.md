# ADR-0009: Optional headless frontends alongside the built-in site

- Status: proposed
- Date: 2026-11-10
- Related: [ADR-0001](0001-request-and-process-state.md), [ADR-0003](0003-framework-revisit-triggers.md), [ADR-0004](0004-dual-track-device-environment-analytics.md), [ADR-0006](0006-four-locale-i18n-foundation.md)

## Context

Kobato ships one complete site in a single process: React Router renders the public site, Hono serves APIs and resources, admin and editor share the deployment, and the SEA distribution needs no Node runtime or `node_modules` on the target. That out-of-the-box experience is valuable and is not a legacy burden to be removed.

Some users want to own the public frontend completely — components, routing composition, data fetching, styling, SSR strategy, deployment — without executing user code inside Kobato. Liquid or Handlebars would introduce a second rendering model with host-managed interactive islands; precompiled React theme packages would create a privileged plugin runtime with React ABI, hydration, external-module loading, and failure-isolation problems.

The existing `content.*` oRPC group is an internal read seam, not a stable public contract: its DTOs carry framework shapes such as `MetaDescriptor` (`src/shared/types/listing.ts`); listing and detail reads record page views (`content-listings.controller.ts`, `content-detail.controller.ts`); `content.bootstrap` mixes content with session, CSRF, viewer, font, and document-settings concerns; detail reads can fall back to an authorized draft when a session is present.

The question is therefore not which template language to add, but whether Kobato supports independently deployed frontends while preserving its built-in site and single-binary distribution. The forces: frontend freedom favors independent applications over in-process themes; a default installation must stay a complete site; public reads must not execute analytics, auth, preview, or other side effects; comments, likes, accounts, previews, and analytics have different trust and caching needs than public content; public URLs, feed URLs, image endpoints, WordPress compatibility routes, pagination routes, and admin/editor remain commitments; a public contract is a long-term compatibility commitment, so exposing current internal DTOs would freeze accidental details; ADR-0001's single-process constraint applies to the CMS, not to independently scaled frontends.

## Decision

### Terms

| Term                    | Meaning                                                                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Built-in frontend**   | The existing `routes/public/**` + `ui/public/**` React Router site shipped inside Kobato.                                                                        |
| **External frontend**   | An independently built and deployed application presenting Kobato content through public contracts; React Router, another React framework, or a non-React stack. |
| **Headless capability** | The optional ability to run an external frontend. Not a mode that disables the built-in frontend.                                                                |
| **Public Content API**  | The versioned, anonymous, read-only JSON contract under `/api/content/v1`, with no page-view, draft-preview, or session side effects.                            |
| **Interaction API**     | Session/CSRF/token-aware contracts for comments, likes, and other public mutations; separate from the Public Content API.                                        |
| **External theme**      | Source code for an external frontend, normally a Git repository or starter. Never an executable package installed into Kobato.                                   |

"Headless" without qualification is avoided in implementation and product copy: it must be clear whether the discussion concerns the built-in frontend, read-only headless consumption, or a fully interactive external frontend.

### 1. Optional capability, never headless-only

Kobato becomes **a CMS with a built-in frontend and an optional headless capability**. The built-in frontend stays supported, enabled by default, and covered by the existing unit, integration, browser, e2e, and SEA journeys; a fresh installation still produces a complete blog without another build or service.

An external frontend is an additional deployment unit owned by its operator. Kobato does not build it, host its source, install its npm dependencies, or execute its code. External frontends may scale independently; this introduces no CMS replicas and does not change ADR-0001.

Headless integration is chosen over an in-process Liquid, Handlebars, or React theme runtime. A future appearance/token system for the built-in frontend is orthogonal and neither approved nor rejected here.

Non-goals: replacing the built-in frontend or migrating Kobato's framework (ADR-0003 unchanged); theming the admin, authentication screens, or editor; a public admin/write API or long-lived admin credentials in browser code; arbitrary user TSX, server functions, or React bundles inside the CMS process; a client-side-only SPA as the official template; multi-instance Kobato CMS deployment.

### 2. Separate public content, interaction, and preview contracts

| Contract          | Trust and side effects                                                               | Cache posture                                | Cross-origin posture                                                                      |
| ----------------- | ------------------------------------------------------------------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `/api/content/v1` | Anonymous reads of Live/public data only; no writes, tracking, or preview fallback   | Public, revalidatable, cookie-free responses | Server-to-server anywhere; browser reads only through route-scoped, non-credentialed CORS |
| Interaction API   | Existing session, CSRF, comment-token, like-token, RBAC, rate-limit, and audit rules | Private or `no-store` as appropriate         | Fully supported only through the same-origin deployment below                             |
| Preview exchange  | Short-lived, revision-bound authorization for one draft                              | `no-store`; never tracked or publicly cached | Server-to-server exchange; no admin cookie or long-lived token in the browser             |

Safe public-content `GET`/`HEAD` requests require no CSRF token and must not mint an anonymous CSRF cookie, commit a session, or return `Set-Cookie`, even when the caller sends an existing session cookie. This needs an explicit anonymous-read projection in the request pipeline; ignoring `viewer` inside a controller is insufficient because the middleware can still mint or commit session state.

The existing `/rpc/*` surface remains an internal application contract. It is not renamed or declared the stable headless API.

### 3. Versioned Public Content API

Root `/api/content/v1`: ordinary resource-oriented JSON over `GET` and `HEAD`, usable from any backend, static builder, browser, or framework without an oRPC client.

- Site and listings: `GET /site` (identity, locale/time-zone/display settings, navigation, socials, public appearance, flags, capabilities); `/home?page=N` (home listing, featured posts, public sidebar); `/posts?page=N`; `/categories`; `/categories/{slug}/posts?page=N`; `/tags/{slug}/posts?page=N`; `/archives`; `/search?q=...&page=N` under the existing query-length and rate-limit rules.
- Detail: `/posts/{slug}` and `/pages/{slug}` — Live detail, sanitized body, headings, taxonomy, public counts, friends data when enabled, framework-neutral SEO.
- Engagement: `/posts/{slug}/comments` and `/pages/{slug}/comments` (public approved threads, no viewer-owned pending comments); `/posts/{slug}/webmentions` and `/pages/{slug}/webmentions`; `/friends`.

Wire-schema semantics are binding; exact Zod schemas are a phase-1 deliverable:

- Only Live content and public projections. Scheduled, soft-deleted, unpublished, and draft-only rows stay invisible; no draft fallback because an admin or author cookie is present.
- Canonical post aliases, slug collisions, pagination normalization, and overflow redirects keep their HTTP meaning; redirects target the corresponding canonical API resource, not an HTML route.
- Body HTML passes the same `sanitizeHtml(..., 'body')` policy as the built-in render boundary. Lexical editor state is not exposed in v1.
- Dates are ISO instants; locale, site time zone, `timeFormat`, and `contentLanguage` are explicit fields. No React- or React-Router-specific values.
- SEO data is plain strings, URLs, and structured link/meta values, never `MetaDescriptor[]` or React elements.
- No viewer, CSRF tokens, admin flags, encrypted fields, internal settings, draft markers, or preview authorization. Public comments exclude "my pending comment" overlays and other session-specific data; those belong to the Interaction API.
- Page size is server-configured or bounded; callers cannot request unbounded result sets. Search and expensive reads keep resource rate limits.
- Errors use HTTP status plus a stable machine code and safe localized message; never stack traces, SQL, secrets, or internal object dumps.

The major version lives in the path. Within v1, new optional fields and capabilities may be added compatibly; renaming or removing a field, changing its meaning, exposing drafts, or changing Live/redirect semantics requires a new major. `site.capabilities` allows feature detection without parsing the application version. v1 requires an OpenAPI document, framework-neutral TypeScript DTOs, and a contract test proving document and real responses agree; generated or hand-maintained is an implementation choice.

### 4. Share domain reads, not the built-in controllers

The Public Content API reuses domain queries, Live gates, body projection/sanitization, taxonomy, sidebar selection, and localization projections. It does **not** call the `content.*` controllers and strip inconvenient fields:

```text
Domain read/projection → built-in content.* controller → internal DTO + page-view tracking
                       → Public Content controller     → stable public DTO, no side effects
```

Built-in controllers keep their tracking behavior and internal DTOs; public controllers own only HTTP orchestration and public projection. Internal React loader shapes can then evolve without silently breaking external frontends, while contract tests keep both surfaces on the same Live and authorization rules. The first implementation needs no new server cache bucket; correct HTTP revalidation comes before cache optimization.

### 5. External frontends are applications, not plugins

An external frontend owns its framework and React version, components, CSS, client state, SSR/SSG/ISR strategy, hydration, document `<head>`, build artifact, deployment, environment configuration, frontend HTML cache and document ETags, and its choice of which public settings or appearance values to consume (appearance data is an input, not a rendering mandate). Kobato owns content, public resources, authentication/authorization, and the stability of the public contracts.

The official starter uses React Router Framework Mode with SSR: one well-tested reference without restricting other frameworks. It contains a framework-neutral TypeScript client for the Public Content API; a React Router adapter with loaders/actions and canonical route parity; optional public-body progressive enhancements (image zoom, thumbhash, code copy, music players, footnote previews) with static HTML readable without them; a same-origin interaction adapter once interactive support lands; and contract fixtures plus a production deployment example.

Themes are repositories, starters, or forks, never uploads executed by Kobato. A future theme catalog may link reviewed repositories or deployment templates without creating a plugin runtime.

### 6. Fully interactive external frontends require same-origin routing

Read-only consumption works across origins. A full replacement frontend with comments, likes, visitor state, and cookie-based interactions uses one public origin and a reverse proxy:

- Kobato upstream: `/api/content/v1/*`, `/api/interaction/*`, `/api/preview/*`, `/rpc/*`, `/api/analytics/*`, `/webmention`, `/storage/*`, `/fonts/*`, `/images/*`, existing feed/sitemap/manifest/OG resources, `/admin/*`, `/editor/*`.
- Public page URLs, including pagination and WordPress compatibility routes: the external frontend when configured, otherwise the built-in frontend.

The proxy preserves the original host, scheme, client address, and request path. `security.trustedProxies` must list only the actual proxy peers. `siteIdentity.website` remains the canonical public origin, so site-owned asset URLs keep flowing through `/storage/*` and `/fonts/*` instead of being rewritten to a frontend-specific host.

This topology preserves the current `Path=/`, `SameSite=Lax` session and CSRF cookies, keeps admin credentials out of frontend JavaScript, and makes the external frontend — not Kobato's document middleware — own the CSP for its HTML.

**Credentialed cross-origin interaction is not part of v1.** Do not "fix" it with `SameSite=None`, CSRF-exempt `/rpc/*`, arbitrary origin reflection with credentials, or a long-lived admin token in browser-visible frontend environment variables.

### 7. Version the interactive bootstrap separately from document bootstrap

An interactive external frontend needs a small, session-aware bootstrap such as `/api/interaction/v1/bootstrap`, returning only the current public viewer projection or `null`, the CSRF token plus enabled public interaction capabilities, and public comment/form settings needed to render interaction state. It is `private, no-store`, same-origin only, never included in a Public Content API response or shared cache. Public comment reads stay in the Public Content API; pending/own-comment overlays and raw edit bodies remain authorization-gated interactions.

The initial interactive milestone covers comments and likes. Existing public oRPC procedures may be adapted behind versioned HTTP endpoints, but domain rules — moderation, comment tokens, ownership, rate limits, audits, like tokens, CSRF — must remain identical. Visitor authentication, notification drawers, friend applications, and other public features join the support matrix only after the same explicit contract treatment; they must not be advertised because an internal procedure happens to be reachable.

### 8. No page-view side effects in content reads

`GET /api/content/v1/*` never calls `trackPageView`, `bumpPageView`, or an equivalent counter/log producer. SSR fetches, retries, static builds, crawlers, health checks, and conditional revalidation are content reads, not proof of a visit.

The built-in frontend keeps server-observed tracking. An external frontend that wants Kobato analytics emits an explicit page-view event through a separate, bounded intake: one event per actual document view or client-side navigation (never per API fetch or prefetch); the target is validated before a counter is bumped; server-derived IP, user agent, proxy facts, bot/admin gates, DNT behavior, rate limits, and the device-environment event-id join follow existing analytics policy; preview and draft requests are never counted.

A browser beacon may carry page-view and device-environment data together, making external analytics browser-observed: no-JS visitors and beacon blockers can be undercounted, unlike built-in server-observed page views. The difference is explicit. If no-JS parity becomes a release requirement, the same-origin proxy or external frontend server must add a document-request tracking adapter — never re-enable tracking on content reads.

### 9. Revision-bound external preview exchange

The built-in frontend keeps its session-based draft preview and RBAC rules: authors preview their own post drafts, admins any post draft, only admins page drafts.

An external preview must not send an admin session to another origin or use the anonymous content endpoints. Flow: an authorized admin/author asks Kobato for a preview of one entity and revision; Kobato returns a short-lived, single-use, revision-bound code plus the configured external preview URL; in the reference flow the code travels in the URL fragment (never sent in HTTP requests), external-frontend JavaScript posts it to the frontend's own backend and removes it from the address bar with `history.replaceState`, and that backend exchanges it with Kobato for the exact draft representation; the preview response is `no-store`, excluded from analytics, and rendered dynamically. The code is never embedded in rendered HTML, retained client state, analytics, or subsequent links. A query-parameter variant is permitted only with explicit proxy/access-log redaction and `Referrer-Policy: no-referrer`, and must not claim the fragment flow's leakage properties.

Expired, consumed, wrong-entity, and wrong-revision codes fail closed. Public Content API cache keys and ETags never include preview data. The initial implementation may require a fresh code per preview instead of turning it into a long-lived session.

### 10. Cache, locale, SEO, and resource ownership

Public Content API success responses carry `Cache-Control: public, no-cache` (shared caches may store but must revalidate), a strong ETag over the exact JSON response bytes, `Content-Language` from the site's global UI locale, no `Set-Cookie`, no `Vary: Cookie`, and `Vary: Origin` only where route-scoped CORS responses actually vary. Responses contain no per-request clock or random selection that would churn the ETag; deterministic sidebar selection uses the same representation-seeded policy as the built-in site. `HEAD` returns the same representation headers without a body.

An API ETag identifies one JSON resource, **not** the external frontend's HTML document. A frontend HTML cache must key on at least the frontend build/version, route and parameters, and consumed API representations, and must not return the API ETag unchanged as its document ETag.

ADR-0006 remains unchanged: one global UI locale, no `Accept-Language`-selected public URLs, no locale prefix; author-declared `contentLanguage` stays prose metadata, not a UI-locale selector. Kobato continues to serve feeds, sitemap, manifest, OG images, branding, fonts, and stored assets; the external frontend owns HTML meta rendering and must link them correctly, and owns supplemental sitemap/SEO behavior for routes it adds outside Kobato's catalog.

### 11. One opt-in configuration section

A `blog.headless` settings Section follows the existing Section registry and patch model: `enabled: false`, `allowedOrigins: []`, `externalFrontendUrl: null`.

- `enabled` controls the Public Content API, not the built-in frontend.
- `allowedOrigins` applies only to non-credentialed browser reads of `/api/content/v1`: exact HTTP(S) origins, never credentials, interactions, or preview access. Server-to-server reads need no CORS.
- `externalFrontendUrl` is used for admin-facing external view/preview links when configured. It does not alter canonical URLs or route traffic; the reverse proxy owns routing.

This Section is not a general CORS switch; `security.cors` behavior is not broadened.

### Delivery slices

| Slice                            | Deliverable                                                                                                                  | What may be advertised                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **H0 — contract**                | Approve this ADR, add canonical terms to `CONTEXT.md`, define public DTOs, error shapes, support matrix, deployment examples | No runtime support claimed                                           |
| **H1 — read-only**               | Public Content API, OpenAPI, SDK, anonymous/cookie-free pipeline, ETag/CORS tests, SSR starter for content/listings/search   | Read-only external frontends, including separate-origin consumption  |
| **H2 — interactive same-origin** | Reverse-proxy example, interaction bootstrap, comments and likes, body enhancement adapter, explicit analytics intake        | Full public reading plus supported comments/likes on the same origin |
| **H3 — external preview**        | Revision-bound preview exchange, configured external preview links, no-store/no-tracking proofs                              | Authorized draft preview on an external frontend                     |
| **H4 — remaining parity**        | Explicit contracts for visitor auth/notifications/friend applications and any remaining public features                      | Only capabilities listed in the updated support matrix               |

A slice cannot claim parity with the built-in frontend until the official starter exercises that parity over real HTTP. The built-in frontend is never made a consumer of the new HTTP API to prove reuse; the external starter is the dogfood consumer.

### Acceptance gates

- Anonymous and logged-in requests return identical public representations for the same inputs: no `Set-Cookie`, `Vary: Cookie`, viewer fields, draft fallback, or analytics writes. Draft, scheduled, unpublished, and soft-deleted entities stay invisible; canonical aliases and pagination redirects match built-in rules.
- Body HTML survives the same sanitize fixtures as the built-in renderer; framework-specific types and secret/settings fields never appear; CORS headers are limited to configured public-content origins and never authorize credentialed interaction or preview requests.
- Repeated bytes produce the same strong ETag across restarts; any change inside the represented content, public settings, or locale produces a new one; unrelated settings changes do not churn it; conditional `GET` and `HEAD` behave correctly.
- The official SSR starter renders home, post, page, category, tag, archive, search, pagination, and error states through the public API with no admin credential. H2 proves anonymous and signed-in comment flows, comment tokens, likes, CSRF rejection, moderation, and audit behavior through the same-origin proxy.
- Public API SSR retries, static builds, prefetches, and 304s cause zero page-view increments; each explicit external page-view event causes at most one. Preview codes enforce RBAC, entity, revision, expiry, and single use; preview bytes never enter a public cache or analytics stream.
- Existing public/admin routes and React SSR suites show no regression; SEA smoke covers the Public Content API and proves a default installation still needs no external frontend. OpenAPI, TypeScript DTOs, and real response fixtures cannot drift; the support matrix is updated with every new capability; a compatibility policy and deprecation window are published before v1 consumers appear.

## Consequences

- Users get full frontend freedom without Kobato executing their code or sharing a React runtime; the SEA binary, default site, and single-process CMS remain intact. A stable read-only API also enables static generators, mobile clients, integrations, and non-React frontends.
- Read, interaction, preview, and analytics side effects become explicit instead of hidden in page loaders; Kobato commits to a data contract, not a plugin ABI.
- A replacement public site has at least two deployment units and two build/release processes. One-click installation of executable themes is deliberately not provided.
- Kobato gains a long-lived public compatibility commitment and starter/SDK maintenance. Built-in and external renderers share domain reads and fixtures, but pixel/component parity is not automatic.
- Same-origin proxy configuration is part of the interactive deployment contract; separate-origin deployments are read-only until a future authentication design says otherwise.
- Browser-observed external analytics can undercount no-JS clients unless a document-request adapter is implemented; external preview is necessarily more complex than built-in session preview.
- Public content stays public: enabling the API is not a private-content mechanism and must not be presented as one.
- Rejected and not to be reintroduced: precompiled React theme packages inside Kobato (privileged plugin runtime: external modules, React/hydration ownership, failure isolation, SEA verification; revisit only if admin-installed executable themes become a hard requirement); Liquid/Handlebars themes (second renderer, host-owned islands, no framework independence); exposing `content.*` oRPC as the public API (freezes React-shaped DTOs, inherits tracking, CSRF/bootstrap, draft preview); headless-only Kobato (breaks the single-binary default site); relaxed cookies/CORS/CSRF for cross-origin interaction (no secure public auth model); view tracking in API reads (API calls are not visit evidence); making the built-in frontend call its own HTTP API (adds latency, proves nothing external).
