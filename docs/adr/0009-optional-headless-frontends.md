# ADR-0009: Headless-only Kobato, independent Ioryogi, and a stable SDK

- Status: proposed
- Date: 2026-11-11
- Related: [ADR-0001](0001-request-and-process-state.md), [ADR-0003](0003-framework-revisit-triggers.md), [ADR-0004](0004-dual-track-device-environment-analytics.md), [ADR-0006](0006-four-locale-i18n-foundation.md)

This revision replaces the optional-headless proposal dated 2026-11-10. The earlier commitment to keep a built-in public frontend alongside an optional headless capability is explicitly rejected.

## Context

Kobato currently ships its public site, admin, editor, APIs, and resources in one React Router/Hono process and one SEA distribution. The new product goal is different: Kobato will be a comprehensive headless blog backend whose official SDK can be bundled into a user's application, while the existing public site becomes an independent, production-quality frontend with full feature parity.

Three deliverables therefore need clear boundaries:

- Kobato continues to own content, business rules, authentication, authorization, admin/editor SPA, databases, media, public resources, analytics, and observability.
- Ioryogi (`https://github.com/syhily/ioryogi`) owns public page rendering and the complete public user experience currently shipped inside Kobato.
- Kobato SDK owns the public integration contract: typed clients, same-origin route forwarding, version negotiation, interactions, preview, analytics, and framework adapters. It does not own page UI.

The current internal `content.*` oRPC group cannot simply become the public contract. Its DTOs include framework shapes such as `MetaDescriptor`; its outputs were designed for an in-process SSR caller rather than stable serialization; reads can track page views, write search audits, create metric rows, refresh sessions, or fall back to authorized drafts; and `content.bootstrap` mixes content settings with session, CSRF, viewer, fonts, and document concerns. Body sanitization currently occurs at the React rendering boundary, and current draft preview resolves the latest draft rather than an explicitly bound revision.

The forces are:

- A user should be able to install the SDK and obtain the existing backend, admin, endpoints, and media management without rewriting proxies or business logic.
- Kobato remains an independently running backend and a single-process CMS under ADR-0001. SDK code ships with the user's application; the Kobato runtime does not become an npm dependency embedded in that application.
- Ioryogi must reproduce all current public capabilities, not merely demonstrate content fetching. Public page rendering moves out; the underlying capabilities remain in Kobato.
- Public content reads must be anonymous and free of business side effects, while actual document analytics, interactions, and preview have different trust and caching requirements.
- Independently deployed SDK, Ioryogi, and Kobato versions require an explicit, tested compatibility contract.
- Existing public URLs, feeds, media, sessions, CSRF, comment tokens, like tokens, themes, locale behavior, and SEO resources are migration commitments.
- The SEA backend remains a supported artifact, but a fresh installation no longer promises a complete public blog without a separate frontend.

## Decision

### Terms

| Term                              | Meaning                                                                                                                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kobato**                        | The independently running headless CMS backend, including admin/editor/auth SPA, business APIs, media, resources, databases, analytics, observability, and the official SDK source.          |
| **Ioryogi**                       | The independent official public frontend at `syhily/ioryogi`. It is the production migration of the current public site, not a minimal starter or an executable theme installed into Kobato. |
| **Kobato SDK**                    | The versioned public integration product consumed by Ioryogi and other applications. It includes framework-neutral clients and server handlers plus official framework adapters.             |
| **Headless-only**                 | Kobato does not serve the legacy built-in public site. Public HTML is produced by Ioryogi or another external frontend. This is the only delivery form, not a runtime mode.                  |
| **Public Content API**            | The anonymous, read-only, versioned JSON contract rooted at `/api/content/v1`, with no session, preview, audit, metric-creation, or page-view side effects.                                  |
| **Interaction API**               | The versioned, session/CSRF/token-aware contract for public mutations, viewer-specific reads, and the limited admin-scoped operations already used by the public frontend.                   |
| **Public contract**               | Every HTTP contract on which Ioryogi or an SDK public method depends, including content, interaction, preview, analytics, RUM, and version negotiation.                                      |
| **Internal application contract** | The unversioned `/rpc/*` procedures and DTOs used by Kobato's own admin/editor/auth SPA, which ships in the same release as the backend.                                                     |
| **Canonical public origin**       | `siteIdentity.website`: the public origin used for canonical URLs, feeds, OG resources, admin view links, and preview links. Official deployments point it to Ioryogi.                       |
| **External frontend**             | Any independently deployed application consuming Kobato through the SDK/public contracts. Ioryogi is the official complete implementation, not a privileged runtime exception.               |

### 1. Product shape and ownership

Kobato becomes headless-only. After the migration release:

- The legacy built-in public React frontend is no longer a supported delivery artifact.
- A fresh Kobato installation provides setup, admin/editor/auth SPA, public contracts, media management, and backend resources. It does not independently render a public blog.
- There is no `headless.enabled` switch and no switch that selectively disables the legacy public frontend. The public API is always present after installation.
- Kobato does not build, install, host, or execute Ioryogi or user frontend source code. The SDK and adapters are bundled with the user's application; Kobato remains a separate process.
- One Kobato instance may serve multiple API consumers, but it has one canonical public origin.

Ioryogi is:

- the official, complete, production public frontend;
- the reference and dogfood consumer of the SDK;
- a repository that users may fork as a complete frontend;
- independently built, versioned, deployed, and scaled.

There will be no separate minimal starter. A minimal example cannot satisfy the parity gate or replace Ioryogi as the official frontend.

The SDK provides data, DTOs, formatting and theme helpers, route forwarding, version negotiation, errors, interaction methods, preview, analytics, and RUM integration. It does not provide page components, default styles, a theme runtime, or public route composition.

The following are not part of this decision:

- a general public Admin CRUD/write API for posts, pages, settings, or users;
- an embeddable media-management UI for arbitrary user back offices;
- a second JSON login/passkey/magic-link state machine for Ioryogi;
- a generic `@kobato/ui` component library;
- arbitrary user TSX, plugins, server functions, or React bundles executed by Kobato;
- a client-side-only SPA as Ioryogi;
- a general OpenTelemetry collector for user applications;
- completion of the currently partial newsletter user journey as a migration blocker.

Newsletter has public procedures but no complete current public UI and confirmation landing routes. It is therefore classified as an unfinished, separately governed capability, not part of the current-site parity baseline and not advertised as supported by the initial stable SDK.

### 2. Official topology and URL ownership

The default production topology is:

```text
Internet
   │
   ▼
Ioryogi SSR / SDK middleware
   │  Public documents plus same-origin Kobato routes
   │  Only explicitly owned Kobato routes are forwarded
   ▼
Independent Kobato backend (internal origin)
   ├─ admin/auth/editor SPA
   ├─ public and internal APIs
   ├─ SQLite / DuckDB
   └─ storage / feeds / images / analytics / observability
```

Ioryogi is the default public entry. Kobato may listen only on an internal network. A separate reverse proxy remains optional; the SDK must make the two-process deployment work without requiring a hand-written Nginx route table.

`siteIdentity.website` is the Ioryogi public origin in the official deployment. `KOBATO_BACKEND_URL` is server-only SDK deployment configuration. The previous `externalFrontendUrl` proposal is rejected as a duplicate source of truth.

#### Ioryogi-owned public document behavior

Ioryogi owns the current public document routes and their composition:

- `/`, `/page/:num`, `/archives`, `/categories`;
- `/cats/:slug[/page/:num]`, `/tags/:slug[/page/:num]`;
- `/search/:keyword[/page/:num]` and the `/search?q=...` compatibility redirect;
- `/posts/:slug`, `/:slug`, pagination, aliases, overflow, not-found, and public trailing-slash behavior;
- `/tags` → `/` and public WordPress-decoy responses;
- public document CSP, HTML meta rendering, and document cache/ETag policy.

After installation, a direct request to a legacy public HTML document route on the Kobato origin returns `302 /admin`. Before installation, the request enters the `/admin/setup` flow. This redirect never applies to Kobato-owned APIs or resources.

#### Kobato-owned routes

Kobato continues to own:

- `/admin/*`, `/editor/*`, `/admin/signin`, `/admin/setup`, including the existing visitor/admin authentication and logout flows;
- `/api/*` and `/rpc/*` endpoints assigned to it by the SDK route manifest;
- `/storage/*`, `/fonts/*`, `/images/*`, avatar, branding, OG, and calendar resources;
- feed, sitemap, manifest, robots, and Webmention endpoints;
- analytics/RUM intake, setup/backup resources, and backend health/readiness endpoints.

Ioryogi links to the existing Kobato login/setup pages through the same-origin integration; it does not reimplement those authentication screens.

Ioryogi owns `/assets/*`. Kobato build assets move to `/admin/assets/*`, which is inside an existing forwarded namespace. Resource ownership is never inferred from User-Agent, file existence, or response fallback.

Ioryogi owns `/_kobato/preview`; it is not forwarded. User application routes take precedence over SDK middleware, and an unowned path returns “not handled” to the next middleware. Ioryogi uses the complete official route manifest; other applications may disable resource groups they do not need. `/health` and `/ready` belong to the hosting application by default; the SDK exposes backend health checks instead of capturing those paths.

#### Transport paths

- Ioryogi SSR, loaders, static builds, and server handlers call Kobato directly through `KOBATO_BACKEND_URL`, avoiding a self-proxy HTTP hop.
- Browser interactions and same-origin resources use the Ioryogi origin and are forwarded by the SDK.
- Both paths expose the same DTOs, errors, version semantics, and capabilities. Internal backend origins never appear in canonical URLs or browser-visible credentials.

The SDK proxy uses an explicit route/method allowlist and must preserve HTTP semantics:

- streaming request/response bodies, binary data, Range, HEAD, conditional requests, redirects, and `Set-Cookie`;
- method, path, query, status, and representation headers;
- hop-by-hop header removal and correct forwarded client/host/scheme information;
- no request-selected upstream, no whole-file buffering, and route-appropriate timeouts, including long backup restores;
- redaction of cookies, preview codes, backend origins, and sensitive query values from logs/errors;
- preservation of Kobato admin response headers without overwriting Ioryogi's own document CSP.

WebSocket proxying is not claimed because the current contract has no WebSocket requirement.

### 3. Public contract and compatibility governance

Every public contract uses complete Zod wire schemas. The internal `z.custom<T>()` escape used by the SSR-only contracts is not permitted for public DTOs. Content, Interaction, Preview, Analytics, RUM bootstrap, version negotiation, and the limited admin-scoped interaction operations all produce real serialized, validated fixtures.

The public Zod schemas are the canonical source for OpenAPI and TypeScript DTOs. CI proves that schemas, generated artifacts, SDK parsing, and real HTTP responses agree. SDK response parsers ignore unknown optional fields; request validation remains strict. The OpenAPI document covers every SDK-consumed public contract, not only Content API.

The Kobato admin/editor/auth SPA may continue using internal `/rpc/*` contracts because it ships with the backend. Ioryogi and other SDK consumers must not import those private DTOs or construct arbitrary internal procedure URLs. The SDK may reuse domain services behind public endpoints, but public HTTP semantics are independently versioned and tested.

#### Version rules

The stable compatibility promise begins at SDK/Ioryogi `1.0.0` and public API `v1`. Development `0.x`/beta contracts do not acquire permanent compatibility obligations.

| Consumer → backend           | Guarantee                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| SDK `1.2.0` → Kobato `1.2.x` | Fully supported, including later patches.                                                        |
| SDK `1.2.0` → Kobato `1.3.0` | All capabilities already used by the SDK remain compatible. New `1.3` capabilities are optional. |
| SDK `1.2.0` → Kobato `2.0.0` | Existing capabilities remain compatible through the retained old API major.                      |
| SDK `1.3.0` → Kobato `1.2.x` | No reverse-compatibility guarantee. The SDK warns and applies minimum-version/capability rules.  |

The corresponding semver rules are:

- **Patch** changes do not change schemas, statuses, defaults, machine semantics, or required behavior. SDK and Kobato patches may ship independently.
- **Minor** changes may add endpoints, capabilities, optional request parameters with unchanged defaults, and optional response fields that old parsers ignore.
- **Major** changes may introduce a new parallel API contract. They do not permit removal of an existing released API major.
- A newer Kobato major must continue serving and testing every previously released public API major. Routine deprecation/EOL removal is not permitted under this ADR.
- A newer SDK against an older Kobato declares `minimumBackend`, warns on an unverified combination, and continues by default. Missing required core capabilities fail explicitly; missing optional capabilities disable only the affected feature. A strict version policy may turn the warning into a connection failure.

Version negotiation uses stable `contractVersion` and `capabilities` data. Versions answer whether a combination is supported; capabilities answer whether a feature exists. Capability names are stable and unknown keys are ignored by old SDKs. Version warnings are emitted server-side once per process/backend-version combination, not once per request and not into public pages or browser logs.

Compatible additions exclude:

- removing/renaming fields, changing meaning/defaults/status/redirects, or adding required request fields;
- adding values to a closed enum or adding errors that old clients must exhaustively understand;
- changing Live, authorization, cache, privacy, or side-effect semantics without a new contract.

Compatibility is executable, not aspirational:

- preserve immutable fixtures for every released `major.minor`;
- run historical-minor SDK parsing and real HTTP consumer tests against the latest Kobato;
- run old API-major suites against newer Kobato majors;
- run Ioryogi against both its minimum supported and latest Kobato;
- never make a release pass by rewriting an old fixture's incompatible expectation.

### 4. Anonymous Public Content API

The root is `/api/content/v1`. Ordinary resource JSON uses GET/HEAD and does not require an oRPC client.

| Group                   | Resources                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Site and composition    | `/site`, `/home`                                                                                                  |
| Posts and pages         | `/posts`, `/posts/{slug}`, `/pages/{slug}`                                                                        |
| Taxonomy                | `/categories`, `/categories/{slug}/posts`, `/tags`, `/tags/{slug}/posts`                                          |
| Other listings          | `/archives`, `/search`                                                                                            |
| Public engagement reads | `/posts/{slug}/comments`, `/pages/{slug}/comments`, `/posts/{slug}/webmentions`, `/pages/{slug}/webmentions`      |
| Friends                 | `/friends`                                                                                                        |
| Render-support reads    | versioned public music metadata and site-owned image thumbhash resolution, specified in the same OpenAPI contract |

`/posts` and `/tags` are general headless capabilities even though the legacy site did not give each a standalone page. `/home` retains the specialized featured/categoryLinks/sidebar composition.

`/site` contains the anonymous, cacheable site representation:

- identity, canonical origin, global UI locale, site time zone, and time format;
- navigation, footer, socials, public appearance, and sidebar configuration;
- public fonts/resource descriptions and the active public UI message catalog;
- `contractVersion`, capabilities, and public feed/Webmention endpoint discovery.

It excludes viewer, CSRF, comment tokens, the request's selected theme, preview information, and other per-request data. Ioryogi parses the theme cookie through an SDK helper. Viewer and CSRF data belong to Interaction bootstrap.

Home and detail resources include their deterministic sidebar representation and framework-neutral SEO. Detail resources include sanitized body HTML, headings/TOC data, taxonomy, public counts, and canonical information. A page that enables the friends section uses the same friend DTO as `/friends`. Comments and Webmentions remain separate resources so Ioryogi can create its own deferred SSR promises.

#### Wire semantics

- Only Live content is visible in every environment. Draft, future-scheduled, unpublished, soft-deleted, and `publishedRevisionId=null` rows never appear, including when an admin cookie is supplied.
- `visible=false` is orthogonal to Live. Such a post remains readable by detail URL and appears in `/posts`, archives, taxonomy listings, search, feeds, and sitemap; it is excluded from home, featured, and random/sidebar recommendations. The DTO exposes this public visibility distinction explicitly.
- Dates are ISO instants. Relative/localized display labels are rendered by Ioryogi through SDK formatting helpers. Responses contain no request-time `nowIso`, random request ID, or debug clock.
- Sidebar selection is deterministic from the representation scope, site calendar day, and settings representation.
- Body HTML uses the same `sanitizeHtml(..., 'body')` policy as the legacy render boundary. Lexical article/page state, unsanitized HTML, and `bodyHtmlFeed` are not exposed in detail responses.
- Feed, OG, calendar, font, image, and stored-media binaries remain Kobato resources. The API returns their URLs and required metadata rather than duplicating alternate render products.
- Public music/thumbhash reads are anonymous and side-effect-free. Knowing an internal ID must not make otherwise unreferenced private library content anonymously enumerable.
- Public comments contain approved threads only. Viewer-owned pending/delete-request overlays, raw edit bodies, and moderation belong to Interaction API.
- Comment pagination uses a bounded server-controlled `offset`/`nextOffset` contract suitable for “load more”; no caller can request an unbounded result set.
- Counts return zero when a metric row is absent. Reads never create metric/comment-page rows.
- Likes counts may appear in detail DTOs; validate/increase/decrease are interactions.
- SEO consists of plain strings, URLs, and structured link/meta values, never `MetaDescriptor[]`, React elements, or loader-only promises.

#### Pagination, redirects, and errors

- `page` is one-based and page sizes are server-configured/bounded.
- Invalid pagination returns `400 INVALID_PAGINATION`; `page=1` may normalize to the bare resource.
- Overflow redirects target the last page of the same API resource. Alias and post/page slug-conflict redirects target the corresponding canonical API resource, never an HTML route.
- Empty search input returns `400 SEARCH_QUERY_REQUIRED`; an existing collection's empty first page returns a normal empty representation. Missing taxonomy/entities return 404.
- SDK content clients handle API redirects manually when mapping them to Ioryogi's public `/page/:num`, alias, and overflow behavior. Ordinary REST clients may follow them automatically.
- Errors use HTTP status, a stable machine code, and a safe message in the site's UI locale. SDK control flow never parses localized messages.
- Not-found and public-invisible content share the same 404 shape. Invalid input is 400, rate limiting is 429 with `Retry-After` where appropriate, pre-install is `503 INSTALL_REQUIRED`, and unexpected failures are detail-free 500 responses.
- Search and expensive reads retain resource rate limits. No SDK credential or new quota system is invented for ordinary public reads.

### 5. Anonymous HTTP, caching, and CORS

The Public Content API is handled before the existing `requestContextMiddleware`. Its lightweight anonymous context contains only the database, trusted-proxy-derived client address, normalized URL/request ID, request-pinned settings/localization, and infrastructure data required for limits/logging/tracing.

It does not resolve or commit a session, read a viewer, mint CSRF state, allocate a page-view event ID, or create a document CSP nonce. Consequently, a request carrying a valid session cookie returns the same representation and no `Set-Cookie`, and causes no session activity update, search audit, metric creation, page view, or other business write. Infrastructure logs, limits, and traces remain permitted.

The router is always mounted and handles its own pre-install response. Versioned public APIs do not inherit the HTML `303 /admin/setup` install-gate response. SDK document middleware translates `INSTALL_REQUIRED` into the public `/admin/setup` journey.

#### Cache and conditional requests

- Cacheable success responses use `Cache-Control: public, no-cache`, a strong ETag over the exact uncompressed JSON bytes, and `Content-Language` from the global UI locale.
- Deterministic JSON serialization makes identical representations byte-stable across requests, processes, and restarts. A Kobato version change alone does not change an ETag.
- Cacheable 404 responses also use `public, no-cache`. 400, 429, 503, and 500 responses use `no-store`.
- Responses contain no `Set-Cookie` or `Vary: Cookie`. Compression may add `Vary: Accept-Encoding`.
- HEAD computes the same representation headers without a body. `If-None-Match` is the only conditional representation contract; no parallel Last-Modified semantics are introduced.
- 304 preserves ETag, Cache-Control, Content-Language, and applicable Vary headers and has no body or business write.
- API ETags are not reused as Ioryogi document ETags.

#### CORS and configuration

`allowedOrigins` applies only to non-credentialed browser reads of Public Content API:

- exact HTTP(S) origins only; no wildcard, paths, or suffix reflection;
- GET/HEAD and necessary OPTIONS preflight, with `If-None-Match` support and required response-header exposure;
- no `Access-Control-Allow-Credentials`;
- denied preflights return 403;
- an ordinary disallowed-Origin GET may still return public JSON, but without headers that let the browser expose it cross-origin;
- `Vary: Origin` appears only when CORS behavior actually varies the response;
- the existing credentialed global `security.cors` middleware explicitly skips these routes so it cannot append a conflicting policy.

CORS is browser read permission, not access control. Server-to-server reads need no CORS. Interaction, Preview, and Admin gain no cross-origin permission from this list.

The only initial `blog.headless` settings Section shape is:

```ts
{
  allowedOrigins: string[]
}
```

There is no `enabled` or `externalFrontendUrl`. `KOBATO_BACKEND_URL` and SDK version policy belong to the frontend deployment, not public Kobato settings.

### 6. Interaction, authentication, and viewer state

The versioned Interaction API is rooted at `/api/interaction/v1` and covers:

- comments: reply, my-comments overlays, raw edit recovery, edit, delete request/cancel, and token revocation;
- likes: validate, increase, and decrease;
- notifications: list, unread count, read/unread, thread, and reply;
- friend applications;
- the existing admin-in-public-page comment approve/edit/delete operations;
- the existing shared notification drawer admin send/broadcast/recall operations and their required user-selection data.

The last two groups preserve only capabilities Ioryogi already uses. They require the same admin session, RBAC, CSRF, and audits as the current procedures and do not become a general Admin CRUD API.

`GET /api/interaction/v1/bootstrap` returns only the current public viewer or `null`, the CSRF token, viewer-specific interaction capabilities, and required session/form state. It is `private, no-store`, has no public ETag, and explicitly establishes the anonymous `__csrf` double-submit cookie when necessary. Anonymous form configuration shared by every viewer belongs to `/site`.

Safe Interaction GET/HEAD requests never mutate business content and do not mechanically require a CSRF header. Bootstrap and the canonical session middleware may still establish CSRF state or maintain the session as explicitly specified. Every mutation retains the existing CSRF, Origin, cookie, RBAC/token, rate-limit, and audit rules. The backend's internal `/rpc/*` may retain its stricter all-method CSRF behavior.

Comment tokens retain their HttpOnly/SameSite=Lax cookie semantics. Like tokens retain their localStorage behavior and server validation. Credentialed cross-origin interaction is not supported; full interactive deployment remains same-origin through the SDK.

Authorized comment editing may return raw comment Lexical state through Interaction API. This is the only Lexical wire exception: it is owner/admin gated and `private, no-store`. Article/page Lexical state remains private.

Authentication screens and their multi-step actions remain in Kobato at `/admin/signin`. Interaction bootstrap exposes viewer state; it does not recreate the login/passkey/magic-link UI protocol. Email/avatar lookup used by comment forms belongs to Interaction API and retains privacy/rate-limit rules.

### 7. Ioryogi rendering, documents, and code ownership

Ioryogi uses React Router Framework Mode with SSR and a Node server entry through the official Hono/React Router SDK adapters. It preserves real forms, progressive enhancement, streaming documents, and no-JS readability. It is not packaged into Kobato SEA.

Ioryogi owns:

- public routes, root/document/SSR entry, public components and styles;
- public chrome, comments/notifications/friends interactions, and public client hooks;
- route warmup, stale-chunk recovery, public theme/RUM/page integrations;
- public route/component/browser tests.

Kobato owns the separate admin/auth/editor application, its root/routes/styles/tests, and all domain/API/resource tests. The old combined public/workspace root is split.

The existing Inkling layer is published as `@kobato/inkling`, with separate React and react-free headless entry surfaces. Kobato uses the full editor; Ioryogi uses the comment editor, schema, styles, and locale labels. Browser imports must not pull jsdom/server projections. Inkling has its own semver, while comment submission remains constrained by the public Interaction schema.

No generic `@kobato/ui` package is introduced. Public UI moves to Ioryogi, admin UI stays in Kobato, and small shadcn primitives remain copy-owned. Public contract helpers belong to the SDK. Kobato sanitizes content before the wire; Ioryogi does not import Kobato's node/jsdom sanitizer. Kobato supplies SEO data; Ioryogi emits meta/link elements.

#### Document cache and composition

The first stable Ioryogi release keeps public documents at `private, no-cache`. Documents may contain viewer, CSRF, Interaction bootstrap, admin tools, theme, RUM, and CSP state. Making every HTML document publicly cacheable is a separate future optimization requiring an anonymous document shell and static theme bootstrap, not a hidden goal of this migration.

Ioryogi document ETags are independent of API ETags:

- inputs include the Ioryogi build, route/parameters, consumed API representations, locale, theme, viewer, and other document inputs;
- streamed/nonce-bearing documents use a weak ETag unless the hash covers the exact bytes;
- a document 304 records no page view and follows the existing CSP stripping rule required when a cache merges 304 headers into a nonce-bearing stored response;
- an API 304 never automatically becomes a document 304.

Comments and Webmentions preserve deferred SSR. Once detail data succeeds, Ioryogi starts new SDK requests and passes those Ioryogi-owned promises into React Router `<Await>` streaming. Redirect/304/404 responses do no extras work. Existing fallbacks, timeout/error boundaries, and no-JS final readability are preserved. Kobato emits only ordinary JSON and has no React Router streaming dependency.

Static body HTML and enhancement mount points are a public rendering contract. Music-player paused fallback, thumbhash, code copy, image zoom, footnote previews, comment anchors, and their selector/DOM invariants retain parity tests.

### 8. Revision-bound external preview

Preview codes bind `entityType + entityId + revisionId`. Code creation enforces the current RBAC: authors preview their own posts, admins preview any post, and only admins preview pages. The current editor need only request the latest draft or current published revision; an arbitrary historical-preview UI is not a migration requirement.

Exchange always returns the bound revision rather than resolving the latest draft again. A newer revision does not retarget an existing code. Missing/mismatched revisions and deleted entities fail closed.

The only initial preview entry is:

```text
{siteIdentity.website}/_kobato/preview#code=<one-time-code>
```

The flow is:

1. An authorized editor asks Kobato to create a code for one entity/revision.
2. Kobato returns the code and preview URL.
3. Ioryogi serves a content-free, no-tracking bootstrap page.
4. Browser JavaScript reads the fragment, posts the code to Ioryogi's own server, and immediately removes it with `history.replaceState`.
5. Ioryogi exchanges the code directly with Kobato and dynamically renders the exact preview DTO.

Query-parameter preview is not supported. Ordinary public routes ignore the legacy `?draft=true` authorization model and always serve Live content; an admin cookie never changes a Content API representation.

Codes have at least 256 bits of randomness and are stored hashed in the existing `one_time_token` infrastructure under an independent preview tenant. They are single-use, atomically consumed, and expire after 60 seconds. Creation requires session + CSRF + RBAC. Exchange accepts the code only in a request body and has a dedicated IP limit. Expired, consumed, and invalid codes fail without revealing which condition existed.

A refresh or failed exchange requires a fresh code; there is no long-lived preview session or retry resurrection in v1.

Preview bootstrap, exchange, and final HTML are `private, no-store` and `noindex`. They do not emit page views/device-env page-view events, load RUM, enter feeds/sitemaps/public caches, or offer public comment/like mutations. Body sanitization remains identical. Technical traces/logs may record the request but never the code or sensitive draft content. Preview DTOs carry explicit revision/draft metadata for the existing preview badges.

### 9. Analytics, RUM, and Trace

Ioryogi defaults to server-observed page views through SDK document middleware:

- successful public document GETs and real client navigations observed through server data requests produce one event;
- prefetch, HEAD, redirects, 304, 404, preview, assets, and API reads produce none;
- no-JS navigation is naturally observed;
- browser page-view reporting covers only navigation with no server observation and never duplicates a server-observed navigation;
- SSR/API retries, static builds, and conditional API requests remain Trace/log activity, not visits.

The SDK mints a UUID for an observed navigation and makes it available to Ioryogi loader data for the matching device-env beacon. Kobato revalidates the public path/target against Live content instead of trusting a submitted owner ID.

Page-view intake atomically claims a persistent event ID before either counter increments or analytics append. A duplicate event is acknowledged without another count. An event-time acceptance window prevents old events from becoming new visits after idempotency records are cleaned. Device-env retains bounded payloads, independent rate limits, orphan tolerance, and primary-key deduplication.

The SDK forwards client address, host, scheme, UA, and required UA-CH facts. Kobato trusts forwarded facts only from actual `security.trustedProxies` entries. Same-origin analytics intake may resolve the existing session to preserve the admin exclusion; Content API never does. Bot, prefetch, GeoIP, salted visitor hash, and limit behavior remain Kobato-owned.

Migration preserves the current privacy baseline: server-observed page views are not automatically disabled by DNT, while device-env/RUM retain their existing DNT/GPC/consent behavior. Extending DNT/GPC to server page views is a separate product change.

Kobato exposes a versioned, browser-safe RUM bootstrap containing enablement, consent/clientIdentity policy, and same-origin intake information. It never exposes the OpenObserve address, organization, server authorization header, or real RUM token. Ioryogi injects this bootstrap, owns its document CSP, and sends browser data through the same-origin relay without widening `connect-src`. Existing consent, dynamic enablement, and drift behavior remain.

Kobato continues to trace its own API/resource/admin work. SDK handlers propagate W3C `traceparent`/`tracestate` so an instrumented Ioryogi and Kobato share a distributed trace. Kobato does not automatically produce server-side Ioryogi rendering spans and is not a general OTel collector.

### 10. Repositories, artifacts, and deployment configuration

The Kobato repository owns the backend, public contracts/OpenAPI, SDK packages, compatibility matrix, and deployment contract. The Ioryogi repository owns its application version, routes, rendering, and frontend documentation without duplicating API reference material.

Official artifacts are:

- Kobato SEA backend binary;
- `@kobato/sdk`, `@kobato/sdk-hono`, and `@kobato/sdk-react-router` npm packages on one `major.minor` compatibility line;
- independently versioned `@kobato/inkling`;
- Ioryogi source/production build at `syhily/ioryogi`;
- the official Ioryogi container image `ghcr.io/syhily/ioryogi`.

SDK core is framework-neutral and does not import React, Hono, or Kobato server source. Adapters are installed as needed. SDK errors expose HTTP status, stable machine code, structured descriptors, retryability, and distinct network/contract/version/business failures. They never require parsing localized messages.

Ioryogi and Kobato versions and `__APP_VERSION__` values are independent. Route warmup and public chunk policy use Ioryogi's own build and route manifest.

Kobato retains domain/API/admin/resource/SEA tests. Ioryogi owns migrated public route/component/snapshot/browser tests using SDK fixtures. A cross-repository production E2E runs a real Kobato binary and real Ioryogi SSR over SDK HTTP against minimum and latest supported Kobato versions. Kobato SEA smoke verifies admin/API/resources and legacy-document `302 /admin`, not a built-in home page.

After Ioryogi switches completely, the old internal `content.*` procedures may be removed with the legacy public frontend. A smaller private workspace bootstrap serves only Kobato admin/editor/auth needs. Ioryogi never calls old `content.bootstrap`, `content.home`, or `content.posts.*`; compatibility tests cover only the new public contracts.

Minimum official configuration is:

- Ioryogi: `KOBATO_BACKEND_URL`, listen/public-origin settings required by its platform, and optional strict SDK version policy;
- Kobato: canonical `siteIdentity.website`, actual proxy peers in `security.trustedProxies`, and existing database/storage/mail/observability settings.

Ioryogi liveness checks only its own process; readiness also checks the Kobato handshake. Kobato health/ready retains backend semantics. Version/proxy misconfiguration produces actionable logs rather than silently recording wrong client addresses or disabling features.

### 11. Upgrade and rollback

The supported existing-user path is **deploy Ioryogi first, then upgrade to the headless-only Kobato major**.

The migration must preserve:

- content, revisions, media, and analytics data without a required destructive format conversion;
- the existing public origin and public URLs when `siteIdentity.website` is unchanged;
- session, CSRF, comment-token, theme-cookie, and like-localStorage semantics;
- feed, sitemap, OG, image, and `/storage` URLs through Ioryogi/SDK.

The headless-only change is a product major, never an unannounced patch/minor update. Release notes and the updater must state that upgrading Kobato without deploying Ioryogi makes legacy public document URLs enter `/admin` rather than render the old site.

The cutover should not require destructive database migration. Preview codes reuse existing token infrastructure, and new settings remain additive and safe for an older backend to ignore. A pre-upgrade backup is required by the deployment guide.

A real rollback smoke covers Kobato, Ioryogi, and the public traffic entry together. Rolling back only one process is not a complete plan. If an implementation change makes the previous Kobato major unable to read the data, the release must identify that irreversible point explicitly rather than claiming rollback from unchanged content formats alone.

### 12. Delivery slices

Every slice defines its public schemas/OpenAPI before its consumer implementation. M1–M4 may ship only as development/beta work; M5 is the stable parity gate.

| Slice                                          | Deliverables                                                                                                                                                                                             | Advertised state                        |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **M0 — contract and baseline**                 | This ADR; route ownership; complete parity inventory; public DTO/version rules; characterization fixtures for current behavior                                                                           | No runtime support claimed              |
| **M1 — SDK and Ioryogi skeleton**              | SDK core/Hono/React Router adapters, version handshake, streaming proxy, Ioryogi SSR app, `/admin/assets` separation; setup/login/admin/media/resources through Ioryogi                                  | Backend integration only                |
| **M2 — anonymous content and read-only pages** | Public Content API, anonymous pipeline, ETag/CORS/OpenAPI; all read-only pages, SEO, i18n, theme, body enhancements, public comments/Webmentions, deferred SSR                                           | Read-only external frontend             |
| **M3 — complete interactions**                 | Comment owner flows, likes, notifications, friend applications, and existing limited admin-scoped public-page operations                                                                                 | Interactive frontend on the same origin |
| **M4 — preview, analytics, and observability** | Revision-bound preview, server page-view intake and idempotency, device-env join, RUM bootstrap/relay, Trace Context                                                                                     | Preview and analytics parity candidates |
| **M5 — full parity and headless-only cutover** | Cross-repository E2E, compatibility suite, migration/rollback guide, SDK/Ioryogi `1.0.0`, Ioryogi image, Kobato new major; legacy document `302 /admin`, then legacy public frontend/`content.*` removal | Stable headless-only product            |

### Acceptance gates

A stable M5 release requires every gate below. An unverified gate means beta, not `1.0.0`.

- **Parity inventory:** every current public behavior is explicitly classified as moved to Ioryogi, retained in Kobato through SDK, or intentionally retired. No item is “unchecked.” The only excluded unfinished capability is the newsletter flow described above.
- **Read-only correctness:** anonymous and logged-in Content API requests return identical representations with no `Set-Cookie`, session activity, search audit, metric creation, draft fallback, or analytics write. Live/visibility/pagination/alias rules have route-level coverage.
- **Contract compatibility:** public schemas, OpenAPI, SDK DTOs, and real responses agree; old fixtures and old API majors run against the newest backend; unknown compatible fields do not break old SDKs.
- **Public user journeys:** home/list/detail/archive/search/friends, comments, likes, notifications, visitor auth, admin inline operations, media, music, body enhancements, themes, four locales, SEO, feeds, sitemap, OG, and no-JS behavior pass through real Ioryogi HTTP.
- **Preview:** RBAC, entity/revision binding, expiry, single use, fragment hygiene, no-store/noindex, no analytics/RUM, and failure responses are proven.
- **Analytics:** document and client navigation, prefetch, 304/404/redirect, preview, repeated IDs, admin/bot gates, and device-env joins produce exactly the contracted counts and events.
- **HTTP/proxy:** streaming binary bodies, Range, HEAD, ETag/304, CORS, cookies, CSRF/RBAC, admin assets, long backup restores, error redaction, and route ownership pass production-like tests.
- **Build and deployment:** both repositories pass formatting, lint, typecheck, unit/integration/browser tests, and production builds. A real Kobato binary + real Ioryogi SSR/container E2E and Kobato SEA smoke pass on minimum/latest supported combinations.
- **Upgrade/rollback:** an existing installation upgrades without public URL/media/session regressions after Ioryogi is deployed, and the documented combined rollback path is exercised.
- **Documentation:** support/capability matrices, minimum/recommended versions, deployment examples, public API docs, and release notes are updated in the same release as their capabilities.

## Consequences

- Kobato becomes a focused headless backend with a reusable integration product. Users can obtain the existing admin, endpoints, media, and interactions through the SDK without executing frontend code inside Kobato.
- Ioryogi preserves the complete existing public experience while gaining independent framework, build, deployment, and scaling ownership. Other frameworks can consume the same public contracts.
- A standard deployment now has at least two runtime units. A fresh Kobato binary alone no longer renders a public blog. The official Ioryogi container limits the additional deployment friction but does not remove the second unit.
- The old built-in public frontend is deliberately removed after parity. This simplifies the backend but makes the major upgrade dependent on a working Ioryogi deployment and a coordinated traffic/rollback plan.
- The compatibility commitment is deliberately strong: every released public API major remains operational in future Kobato majors. This preserves old SDK/Ioryogi deployments at a permanent contract-testing and maintenance cost.
- Public Content API becomes deterministic and cacheable without inheriting session, analytics, audit, or preview behavior. Interaction and viewer state remain private and same-origin.
- Ioryogi initially retains private, revalidatable HTML rather than pursuing shared HTML caching. Public API caching and server-observed analytics are preserved without introducing anonymous-shell work into the migration.
- Server-observed external analytics requires correct trusted-proxy deployment and a new idempotent intake, but avoids the systematic no-JS/beacon-blocker undercount of a browser-only design.
- Revision-bound, single-use preview is more complex than legacy session preview but does not expose admin cookies, long-lived tokens, or draft representations to public caches.
- Inkling becomes a shared editor package. Small UI duplication between the two applications is accepted instead of creating a general component ABI.
- Newsletter remains a separately governed unfinished capability and is not silently advertised as part of the stable SDK.
- Rejected: optional headless alongside a permanently supported built-in public site; a `headless.enabled` mode switch; a separate minimal starter; embedding the Kobato runtime as an npm server dependency; exposing internal `/rpc/*` DTOs as public contracts; general Admin CRUD in the SDK; credentialed cross-origin interactions; tracking page views on content reads; query-string/long-lived preview sessions; a generic `@kobato/ui`; a client-only Ioryogi; and a general Kobato-hosted OTel collector for user applications.
