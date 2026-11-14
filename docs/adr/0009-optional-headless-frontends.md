# ADR-0009: Headless-only Kobato, independent Ioryogi, and a stable SDK

- Status: proposed
- Date: 2026-11-11
- Revised: 2026-11-14
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

Ioryogi links to the existing Kobato login/setup pages through the same-origin integration; it does not reimplement those authentication screens. The only supported admin/auth browser origin is `siteIdentity.website`, reached through that integration. Direct internal-origin and alternate-hostname admin/auth access are unsupported: WebAuthn derives its relying-party ID and origin from `siteIdentity.website`, so a second admin origin cannot provide a working passkey journey. Changing the canonical origin may require passkey re-enrollment; the migration preserves it by default.

Ioryogi owns `/assets/*`. Kobato build assets move to `/admin/assets/*`, which is inside an existing forwarded namespace. Resource ownership is never inferred from User-Agent, file existence, or response fallback.

Ioryogi owns `/_kobato/preview`; it is not forwarded. User application routes take precedence over SDK middleware, and an unowned path returns “not handled” to the next middleware. Ioryogi uses the complete official route manifest; other applications may disable resource groups they do not need. `/health` and `/ready` belong to the hosting application by default; the SDK exposes backend health checks instead of capturing those paths.

#### Transport paths

- Ioryogi SSR, loaders, static builds, and server handlers call Kobato directly through `KOBATO_BACKEND_URL`, avoiding a self-proxy HTTP hop.
- Browser interactions and same-origin resources use the Ioryogi origin and are forwarded by the SDK.
- Both paths expose the same DTOs, errors, version semantics, and capabilities. Internal backend origins never appear in canonical URLs or browser-visible credentials.

The SDK proxy uses an explicit route/method allowlist and must preserve HTTP semantics:

- streaming request/response bodies, binary data, Range, HEAD, conditional requests, redirects, and multiple unmerged `Set-Cookie` headers;
- method, path, query, status, and representation headers;
- hop-by-hop header removal and correct forwarded client/host/scheme information;
- no request-selected upstream, no whole-file buffering, cancellation/abort propagation, and route-appropriate timeouts, including long backup restores;
- unbuffered SSE for `/api/analytics/events`, with heartbeat and downstream-disconnect propagation and no ordinary 30-second response deadline;
- redaction of cookies, preview codes, backend origins, and sensitive query values from logs/errors;
- response-header ownership decided by the manifest route group: forwarded Kobato admin/API/resource responses retain their headers, while Ioryogi-owned documents retain Ioryogi's CSP. Content-type sniffing, path guessing, and response fallback are forbidden.

WebSocket proxying is not claimed because the current contract has no WebSocket requirement.

### 3. Public contract and compatibility governance

Every public JSON contract uses complete Zod wire schemas. The internal `z.custom<T>()` escape used by the SSR-only contracts is not permitted for public DTOs. Content, Interaction, Preview, Analytics, RUM bootstrap, version negotiation, and the limited admin-scoped interaction operations all produce real serialized, validated fixtures. Binary and document resources instead specify their media types, methods, statuses, and representation headers explicitly; Zod is not a binary-format schema.

The public Zod schemas are the canonical source for OpenAPI and TypeScript DTOs. CI proves that schemas, generated artifacts, SDK parsing, and real HTTP responses agree. SDK response parsers ignore unknown optional fields; request validation remains strict. The OpenAPI document covers every SDK-consumed public contract, not only Content API, including redirects, errors, headers, and non-JSON resources.

The Kobato admin/editor/auth SPA may continue using internal `/rpc/*` contracts because it ships with the backend. Ioryogi and other SDK consumers must not import those private DTOs or construct arbitrary internal procedure URLs. The SDK may reuse domain services behind public endpoints, but public HTTP semantics are independently versioned and tested.

#### Version rules

The stable compatibility promise begins at SDK/Ioryogi `1.0.0` and public API `v1`. Development `0.x`/beta contracts do not acquire permanent compatibility obligations.

SDK and Kobato versions are not lockstep; each SDK release declares its own `minimumBackend`. The initial and subsequent combinations follow this table:

| Consumer → backend                                     | Guarantee                                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| SDK `1.0.0` (`minimumBackend: 8.1.0`) → Kobato `8.1.x` | Fully supported initial stable line, including later `8.1` patches.                              |
| SDK `1.0.0` → Kobato `8.2.0`                           | All capabilities already used by the SDK remain compatible. New `8.2` capabilities are optional. |
| SDK `1.0.0` → Kobato `9.0.0`                           | Existing capabilities remain compatible through retained public API `v1`.                        |
| SDK `1.1.0` (`minimumBackend: 8.2.0`) → Kobato `8.1.x` | No reverse-compatibility guarantee. The SDK warns and applies minimum-version/capability rules.  |

The initial release binding is concrete rather than circular: **Kobato `8.1.0`** is the first stable carrier of public API `v1` and still ships the built-in public frontend. SDK and Ioryogi `1.0.0` declare `minimumBackend: 8.1.0`. **Kobato `9.0.0`** is the headless-only major. Neither SDK nor Ioryogi may label its stable `1.0.0` release before the `8.1.0` contracts and parity gates are released.

The corresponding semver rules are:

- **Patch** changes do not change schemas, statuses, defaults, machine semantics, or required behavior. SDK and Kobato patches may ship independently.
- **Minor** changes may add endpoints, capabilities, optional request parameters with unchanged defaults, and optional response fields that old parsers ignore.
- **Major** changes may introduce a new parallel API contract. They do not permit removal of an existing released API major.
- A newer Kobato major must continue serving and testing every previously released public API major. Routine deprecation/EOL removal is not permitted under this ADR.
- A newer SDK against an older Kobato declares `minimumBackend`, warns on an unverified combination, and continues by default. Missing required core capabilities fail explicitly; missing optional capabilities disable only the affected feature. A strict version policy may turn the warning into a connection failure.

Version negotiation uses stable `backendVersion`, `contractVersion`, and `capabilities` data from `/api/content/v1/site`. `backendVersion` is the released Kobato semver used for `minimumBackend`; `contractVersion` identifies the wire contract independently. Versions answer whether a combination is supported; capabilities answer whether a feature exists. Capability names are stable and unknown keys are ignored by old SDKs. Version warnings are emitted server-side once per process/backend-version combination, not once per request and not into public pages or browser logs.

The initial capability keys are part of the compatibility surface, not an implementation-owned string bag:

| Capability            | Contract present when true                                |
| --------------------- | --------------------------------------------------------- |
| `comments-offset`     | Bounded public comment offsets and viewer overlay methods |
| `likes`               | Like validation/increase/decrease                         |
| `notifications`       | Viewer notification list/thread/read/reply methods        |
| `friend-applications` | Public friend application submission                      |
| `admin-public-tools`  | The limited admin-in-public-page interaction groups       |
| `preview`             | Revision-bound, single-use external preview               |
| `page-view-intake`    | Idempotent server/browser navigation observation intake   |
| `device-env`          | Device-environment beacon intake and event-ID join        |
| `rum-relay`           | Browser-safe RUM bootstrap and same-origin relay contract |

Every stable `8.1.x` backend exposes all nine contract capabilities; runtime enablement, especially RUM, remains separate bootstrap state. A newer SDK treats a missing capability according to its declared required/optional feature policy. Adding a key is a minor contract addition; renaming or changing a key's meaning is major. M0 publishes the machine-readable initial table and fixtures before consumers implement negotiation.

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

| Group                   | Resources                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| Site and composition    | `/site`, `/home`                                                                                             |
| Posts and pages         | `/posts`, `/posts/{slug}`, `/pages/{slug}`                                                                   |
| Taxonomy                | `/categories`, `/categories/{slug}/posts`, `/tags`, `/tags/{slug}/posts`                                     |
| Other listings          | `/archives`, `/search`                                                                                       |
| Public engagement reads | `/posts/{slug}/comments`, `/pages/{slug}/comments`, `/posts/{slug}/webmentions`, `/pages/{slug}/webmentions` |
| Friends                 | `/friends`                                                                                                   |

`/posts` and `/tags` are general headless capabilities even though the legacy site did not give each a standalone page. `/home` retains the specialized featured/categoryLinks/sidebar composition.

M0 turns this table into a per-resource authorization/cache/rate-limit/pagination matrix. The M2 contract tests execute that matrix rather than inferring these properties from prose.

`/site` contains the anonymous, cacheable site representation:

- identity, canonical origin, global UI locale, site time zone, and time format;
- navigation, footer, socials, public appearance, and sidebar configuration;
- public fonts/resource descriptions, the canonical and asset origins required for document CSP, and the active public UI message catalog;
- `backendVersion`, `contractVersion`, capabilities, and public feed/Webmention endpoint discovery.

It excludes viewer, CSRF, comment tokens, the request's selected theme, preview information, and other per-request data. Ioryogi parses the theme cookie through an SDK helper. Viewer and CSRF data belong to Interaction bootstrap.

Home and detail resources include their deterministic sidebar representation and framework-neutral SEO. Detail resources include sanitized body HTML, headings/TOC data, taxonomy, public counts, and canonical information. A page that enables the friends section uses the same friend DTO as `/friends`. Comments and Webmentions remain separate resources so Ioryogi can create its own deferred SSR promises.

The sanitized detail HTML carries the save-time music metadata snapshot and image thumbhash enhancement attributes already used by the public renderer. Detail DTOs carry cover/taxonomy/friend thumbhashes. Consequently v1 has **no standalone public music-library or image-library lookup**: the existing `music.get` and `image.resolveThumbhash` procedures are not promoted to the stable public contract, and an internal player/image identifier must not make unreferenced library content enumerable. M1 removes them or moves them to an authenticated workspace contract; the M5 stable carrier must not leave them anonymously mounted beside the new API.

Every post/page receives its metric row and stable `metric.public_id` at entity creation, including drafts; M1 includes an idempotent backfill after upgrade and backup restore. Detail DTOs expose that value as `interactionKey`, and comments/likes/Webmentions continue to use it so existing comment-token payloads, cookie namespaces, and like tokens remain valid. A Content API read never provisions a missing row: a missing required `interactionKey` is an invariant failure, not an empty key or a hidden write. This moves metric creation to the write/migration path without changing the public interaction identity.

#### Wire semantics

- Only Live content is visible in every environment. Draft, future-scheduled, unpublished, soft-deleted, and `publishedRevisionId=null` rows never appear, including when an admin cookie is supplied.
- `visible=false` is orthogonal to Live. Such a post remains readable by detail URL and appears in `/posts`, archives, taxonomy listings, search, feeds, and sitemap; it is excluded from home, featured, and random/sidebar recommendations. The DTO exposes this public visibility distinction explicitly.
- Dates are ISO instants. Relative/localized display labels are rendered by Ioryogi through SDK formatting helpers. Responses contain no request-time `nowIso`, random request ID, or debug clock.
- Sidebar selection is deterministic from the representation scope, site calendar day, and settings representation.
- Body HTML uses the same `sanitizeHtml(..., 'body')` policy as the legacy render boundary. Lexical article/page state, unsanitized HTML, and `bodyHtmlFeed` are not exposed in detail responses.
- Feed, OG, calendar, font, image, and stored-media binaries remain Kobato resources. The API returns their URLs and required metadata rather than duplicating alternate render products.
- Public comments contain approved threads only and carry comment HTML pre-sanitized by Kobato with the existing `sanitizeHtml(..., 'comment')` policy. Viewer-owned pending/delete-request overlays, raw edit bodies, and moderation belong to Interaction API; Ioryogi never sanitizes with a different client-side policy.
- Comment pagination uses a bounded server-controlled `offset`/`nextOffset` contract suitable for “load more”; no caller can request an unbounded result set. Existing transparent soft-deleted-parent behavior and bounded child-thread projections, including truncation metadata, remain explicit schema behavior.
- Public Webmentions retain the current approved-only, oldest-first, server-bounded 50-item representation. The v1 schema exposes that bound and does not pretend to return an unbounded complete list or invent caller-selected pagination.
- Null counter columns return zero. Reads never create metric/comment-page rows; the write-time `interactionKey` provisioning invariant above is tested separately.
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

The router is always mounted and handles its own pre-install response. Versioned public APIs do not inherit the HTML `303 /admin/setup` install-gate response. The `503 INSTALL_REQUIRED` representation still carries safe `backendVersion`/`contractVersion` handshake metadata, so readiness can distinguish setup from an incompatible backend. SDK document middleware translates `INSTALL_REQUIRED` into the public `/admin/setup` journey.

#### Cache and conditional requests

- Cacheable success responses use `Cache-Control: public, no-cache`, a strong ETag over the exact uncompressed JSON bytes, and `Content-Language` from the global UI locale.
- Deterministic JSON serialization makes identical representations byte-stable across requests, processes, and restarts. The ETag is derived solely from those representation bytes: identical bytes imply an identical tag, while compatible additive fields or other byte changes may change the tag. `APP_VERSION`, boot tokens, and process identity are never additional ETag inputs; a released `backendVersion` field changes `/site` bytes and therefore its tag in the ordinary way.
- Cacheable 404 responses also use `public, no-cache`. 400, 429, 503, and 500 responses use `no-store`.
- Responses contain no `Set-Cookie` or `Vary: Cookie`. Compression may add `Vary: Accept-Encoding`.
- HEAD computes the same representation headers without a body. `If-None-Match` is the only conditional representation contract; no parallel Last-Modified semantics are introduced.
- 304 preserves ETag, Cache-Control, Content-Language, and applicable Vary headers and has no body or business write.
- API ETags are not reused as Ioryogi document ETags.

The initial SDK keeps no implicit response cache and serves no stale data. A caller that stores a representation may use ETag conditional requests, but Kobato may assemble the complete current representation before answering 304. Generation-only “cheap 304” validation and an SDK short-TTL/L1 cache are separate future optimizations, not hidden M2 requirements. M0 records per-route backend-call and latency budgets from the current renderer, and M5 verifies the no-implicit-cache implementation against them.

#### CORS and configuration

`allowedOrigins` applies only to non-credentialed browser reads of Public Content API:

- exact HTTP(S) origins only; no wildcard, paths, or suffix reflection;
- GET/HEAD and necessary OPTIONS preflight, with `If-None-Match` support and required response-header exposure;
- no `Access-Control-Allow-Credentials`;
- denied preflights return 403;
- an ordinary disallowed-Origin GET may still return public JSON, but without headers that let the browser expose it cross-origin;
- `Vary: Origin` appears only when CORS behavior actually varies the response;
- applicable allow/expose headers and `Vary: Origin` also accompany conditional 304 and error responses, not only JSON 200 responses;
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

M0 maps the current procedures individually to versioned routes and fixtures: `comments.replyComment/myComments/getRaw/edit/updateOwn/requestDeleteOwn/cancelDeleteOwn/revokeToken`, `likes.validate/increase/decrease`, `notifications.list/unreadCount/markRead/markUnread/thread/reply`, `friends.apply`, `avatar.find`, `admin.comments.approve/edit/delete`, `admin.notifications.sendDirect/sendBroadcast/recall`, and `admin.users.list`. `comments.loadComments` maps to bounded Content API comment pagination plus viewer overlays rather than remaining a viewer-dependent public read. Admin-workspace-only procedures such as `comments.loadMine/searchMineEntities/myCounts/resolveEntity` remain internal `/rpc/*` contracts.

An `interactionKey` is an identifier, never proof that the target is public or that the caller is authorized. Anonymous comment replies and all like operations revalidate the target against the Live gate; a metric row belonging to a draft/deleted entity is not sufficient. Existing owner/admin raw-edit, edit, and delete recovery follows its existing ownership/RBAC policy even if the parent later becomes non-Live, without turning that path into public content disclosure. Preview exposes no comment/like mutation.

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

Ioryogi derives document CSP from the canonical and asset origins exposed by `/site`, generates its own nonce, and never widens `connect-src` for RUM. It also owns the current public-document security-header behavior, including `Accept-CH`, the Webmention `Link` header, and the applicable secure-header baseline. M0 characterizes these headers by route; M2 parity tests compare them. Content API responses need no `Accept-CH`: they perform no device-environment observation, while Ioryogi documents must opt the browser into the hints forwarded with navigation intake.

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
5. Ioryogi exchanges the code directly with Kobato through `POST /api/preview/v1/exchange` and dynamically renders the exact preview DTO.

The exchange endpoint is Kobato-owned and listed in the route manifest and OpenAPI document. It uses the lightweight anonymous pipeline rather than `requestContextMiddleware`: no session, viewer, CSRF cookie, or credentialed CORS is involved. The one-time code is the exchange credential; a dedicated IP limit, body cap, `private, no-store`, and detail-free failures apply. Code creation remains an authorized internal admin/editor operation.

Query-parameter preview is not supported. Ordinary public routes ignore the legacy `?draft=true` authorization model and always serve Live content; an admin cookie never changes a Content API representation.

Codes are 32 random bytes encoded as base64url and are stored in the existing `one_time_token` table under key `preview:v1:<sha256(rawCode)>`, where the hash is lowercase hexadecimal. This versioned prefix isolates setup, passkey, magic-link, comment, and preview key spaces without pretending the schema has a tenant column. They are single-use, atomically consumed by `DELETE … RETURNING`, and expire after 60 seconds. Creation requires session + CSRF + RBAC. Exchange accepts the code only in a request body and has a dedicated IP limit. Expired, consumed, and invalid codes fail without revealing which condition existed. The existing hourly `kv.maintenance` sweep deletes every expired `one_time_token` row by `expiresAt`, independent of prefix; preview fixtures prove both key-space isolation and purge coverage.

A refresh or failed exchange requires a fresh code; there is no long-lived preview session or retry resurrection in v1.

Preview bootstrap, exchange, and final HTML are `private, no-store` and `noindex`. They do not emit page views/device-env page-view events, load RUM, enter feeds/sitemaps/public caches, or offer public comment/like mutations. Body sanitization remains identical. Technical traces/logs may record the request but never the code or sensitive draft content. Preview DTOs carry explicit revision/draft metadata for the existing preview badges.

### 9. Analytics, RUM, and Trace

Ioryogi defaults to server-observed page views through the SDK React Router adapter and document middleware:

- successful public document GETs and real client navigations observed through server data requests produce one event;
- prefetch, HEAD, redirects, 304, 404, preview, assets, and API reads produce none;
- no-JS navigation is naturally observed;
- browser page-view reporting covers only a navigation that made no eligible server document/data request; a failed server intake is retried with the same ID, not reclassified as browser-only;
- SSR/API retries, static builds, and conditional API requests remain Trace/log activity, not visits.

#### Navigation identity and intake

The SDK adapter mints one UUIDv4 per observed navigation in request-scoped server context. All route loaders involved in that navigation share it; an initial document and each later client data navigation are distinct navigations with distinct IDs. Successful loaders publish the ID as `eid` for the matching device-env beacon, while redirect/304/404/error results publish none. The adapter does not accept a navigation ID supplied by an inbound browser header.

The adapter submits `eventId`, normalized public path, `observedAt`, and target hint in the JSON body of `POST /api/analytics/v1/page-view`. SSR calls Kobato directly; browser-only fallback calls the same endpoint through the same-origin SDK forward. A browser-only navigation mints one ID with `crypto.randomUUID()` and uses it for both page-view and device-env reporting. Content API requests carry no navigation ID and never become observations.

Kobato, not the SDK or browser, revalidates the canonical public path/target against Live content and computes the observation disposition under the existing admin, prefetch, bot, counter, and privacy rules. The analytics path forwards client address, host, scheme, UA, required UA-CH facts, and the original cookie to analytics intake, never to anonymous Content API; Interaction API requests retain their own separate credential rules. Kobato trusts forwarded facts only from actual `security.trustedProxies` entries; same-origin or correctly forwarded intake may resolve the session for admin exclusion. Bot, GeoIP, daily-salted visitor hash, and rate-limit behavior remain Kobato-owned.

#### Durable acceptance and replay

Intake is best-effort until Kobato accepts it, and exactly-once after acceptance:

1. Kobato validates and enriches the observation first, without persisting the raw client IP. The durable record contains only the privacy-approved enriched event and server device-env data.
2. One SQLite transaction inserts a ledger row keyed by `eventId`, its canonical payload fingerprint, and immutable disposition. For an accepted event it also inserts a pending analytics outbox record and applies any page-view counter transition; an ignored event has neither. The intake response is not successful until this transaction commits.
3. A duplicate ID with the same fingerprint returns the recorded accepted/ignored outcome without another counter or analytics append. Reusing an ID for a different observation fails with `409 ANALYTICS_EVENT_CONFLICT` and changes nothing.
4. A crash-recovered worker replays pending outbox rows. DuckDB `access_events.event_id` and `device_env_server.event_id` primary keys are replay guards; an existing matching row is success rather than a batch-poisoning duplicate. The outbox becomes dispatched only after both durable writes are accounted for, after which its enriched payload can be dropped while the minimal dedup record remains.

M0 fixes the numeric event-age and future-clock-skew bounds in the public schema. Ledger retention must exceed the acceptance window, so a cleaned ID can never later be accepted as an old new visit; retention/deletion preserves the existing analytics privacy baseline. Device-env retains bounded payloads, independent rate limits, orphan tolerance, and primary-key deduplication. M4 tests duplicate delivery, conflicting IDs, ignored outcomes, crash points between SQLite and DuckDB, replay, retention, and browser/server observability classes.

Migration preserves the current privacy baseline: server-observed page views are not automatically disabled by DNT, while device-env/RUM retain their existing DNT/GPC/consent behavior. Extending DNT/GPC to server page views is a separate product change.

Kobato exposes a versioned, browser-safe RUM bootstrap containing enablement, consent/clientIdentity policy, and same-origin intake information. It never exposes the OpenObserve address, organization, server authorization header, or real RUM token. Ioryogi injects this bootstrap, owns its document CSP, and sends browser data through the same-origin relay without widening `connect-src`. Existing consent, dynamic enablement, and drift behavior remain.

Kobato continues to trace its own API/resource/admin work. SDK handlers propagate W3C `traceparent`/`tracestate` so an instrumented Ioryogi and Kobato share a distributed trace. Kobato does not automatically produce server-side Ioryogi rendering spans and is not a general OTel collector.

### 10. Repositories, artifacts, and deployment configuration

The Kobato repository owns the backend, public contracts/OpenAPI, SDK packages, compatibility matrix, and deployment contract. The Ioryogi repository owns its application version, routes, rendering, and frontend documentation without duplicating API reference material.

The repository becomes a pnpm workspace with explicit `packages/*` membership for the SDK trio and Inkling. The canonical public Zod schemas live in the framework-neutral `@kobato/sdk` contracts entry; Kobato's HTTP handlers, OpenAPI generation, and SDK parsing all import that same workspace source rather than maintaining generated schema copies. The SEA build bundles the server-side use just like other dev-time source dependencies. Changesets manages npm versions and changelogs, with the three SDK packages on one fixed `major.minor` line and Inkling independently versioned. Tag-driven publish CI builds clean tarballs, runs their consumer fixtures, and publishes with npm provenance. Inkling has its own build-time version define rather than inheriting Kobato's `__APP_VERSION__`.

Official artifacts are:

- Kobato SEA backend binary;
- `@kobato/sdk`, `@kobato/sdk-hono`, and `@kobato/sdk-react-router` npm packages on one `major.minor` compatibility line;
- independently versioned `@kobato/inkling`;
- Ioryogi source/production build at `syhily/ioryogi`;
- the official Ioryogi container image `ghcr.io/syhily/ioryogi`.

SDK core is framework-neutral and does not import React, Hono, or Kobato server source. Adapters are installed as needed. SDK errors expose HTTP status, stable machine code, structured descriptors, retryability, and distinct network/contract/version/business failures. They never require parsing localized messages.

Ioryogi and Kobato versions and `__APP_VERSION__` values are independent. Route warmup and public chunk policy use Ioryogi's own build and route manifest.

Kobato retains domain/API/admin/resource/SEA tests. Ioryogi owns migrated public route/component/snapshot/browser tests using SDK fixtures. A cross-repository production E2E runs a real Kobato binary and real Ioryogi SSR over SDK HTTP against minimum and latest supported Kobato versions. After the bootstrap release, the minimum is the immutable `v8.1.0` GitHub Release binary downloaded by exact tag and asset name; the latest is the candidate Kobato build, not a floating `latest` release. For the initial M5 bootstrap only, CI first tests the exact `8.1.0` release-candidate binary, then reruns the cross-repository suite against the published `v8.1.0` asset before SDK/Ioryogi `1.0.0` may ship. Candidate SDK packages are packed and installed into Ioryogi so CI tests the same artifacts that publish CI will upload.

The stable-carrier Kobato SEA smoke verifies the built-in public site and the new admin/API/resource contracts so the rollback target remains real. After the headless-only cutover, SEA smoke instead verifies admin/API/resources and legacy-document `302 /admin`, not a built-in home page.

After Ioryogi switches completely, the old internal `content.*` procedures may be removed with the legacy public frontend. A smaller private workspace bootstrap serves only Kobato admin/editor/auth needs. Ioryogi never calls old `content.bootstrap`, `content.home`, or `content.posts.*`; compatibility tests cover only the new public contracts.

Minimum official configuration is:

- Ioryogi: `KOBATO_BACKEND_URL`, listen/public-origin settings required by its platform, and optional strict SDK version policy;
- Kobato: canonical `siteIdentity.website`, actual proxy peers in `security.trustedProxies`, and existing database/storage/mail/observability settings.

Ioryogi liveness checks only its own process; readiness also checks the Kobato handshake and the forwarded admin/auth route group. A reachable backend answering the contracted `INSTALL_REQUIRED` is ready-for-setup, not an outage, so a fresh installation can complete setup through Ioryogi. Transport failure, incompatible versions, and missing required route groups remain not-ready. Kobato health/ready retains backend semantics.

`kobato doctor` validates the canonical public-origin/passkey configuration, and the SDK readiness check verifies the same-origin admin/auth forwarding path. A passkey begin attempted on a noncanonical origin fails with an actionable misconfiguration error rather than a later opaque assertion failure. These checks establish configuration and routing, not a claim to have completed a real WebAuthn assertion. Version/proxy misconfiguration produces actionable logs rather than silently recording wrong client addresses or disabling features.

### 11. Upgrade and rollback

The supported existing-user path is **release and deploy the stable-contract carrier first, cut over Ioryogi, then upgrade to headless-only Kobato**:

1. Back up and upgrade the existing installation to Kobato `8.1.x`. This release still renders the built-in public site and also serves stable public API `v1`.
2. Deploy SDK/Ioryogi `1.0.0` in standby against `8.1.x`, warm its routes/assets, and pass readiness plus production-like smoke before it receives traffic.
3. Switch the public traffic entry to Ioryogi while Kobato remains `8.1.x`, then verify the complete public/admin journey. The entry switch is atomic at the proxy/platform; Kobato's headless major is not involved in this step.
4. In a planned maintenance window, upgrade Kobato to `9.0.0` while Ioryogi remains the public entry. The in-place backend restart can interrupt API/document service; this ADR does not promise zero downtime. M5 must measure the official topology and publish a concrete acceptable outage budget and runbook before `9.0.0` ships. A combined backend-upgrade/traffic-switch shortcut is unsupported because it recreates the legacy-redirect gap.

Rollback distinguishes the two units instead of forcing a needless coupled flip:

- For a Kobato `9.x` failure, roll back to the `8.1.x` carrier while leaving Ioryogi as the entry. Stable v1 remains available and Ioryogi does not go dark.
- For an Ioryogi failure while Kobato is still `8.1.x`, switch the entry back to the built-in public site. Once Kobato is `9.x`, restore `8.1.x` before making that built-in-site switch; coordinate the two actions under the same maintenance runbook.
- An Ioryogi/SDK rollback to another compatible `1.x` release may remain independent of Kobato. The compatibility matrix, not guesswork, decides that combination.

The rollback smoke exercises both `9.x + Ioryogi → 8.1.x + Ioryogi` and `8.1.x + Ioryogi → 8.1.x built-in site`, including the public entry and real HTTP journeys. If an implementation change makes the previous Kobato major unable to read the data, the release identifies that irreversible point explicitly rather than claiming rollback from unchanged content formats alone.

The migration must preserve:

- content, revisions, media, and analytics data without a required destructive format conversion;
- the existing public origin and public URLs when `siteIdentity.website` is unchanged;
- session, CSRF, comment-token, theme-cookie, like-localStorage, and existing passkey semantics at that unchanged origin;
- feed, sitemap, OG, image, and `/storage` URLs through Ioryogi/SDK.

The headless-only change is a product major, never an unannounced patch/minor update. Kobato `8.1.0` ships the updater gate before `9.0.0` exists: applying a cross-major update requires an explicit confirmation containing the exact target version, and the server rechecks the current/target majors to reject missing or stale confirmation. Direct self-update from pre-`8.1` to `9.x` is refused; the operator must pass through the stable carrier. Release notes and the updater state the Ioryogi prerequisite, the planned-interruption budget, legacy-document `302 /admin`, and the retirement of admin-only `?draft=true` bookmarks/scripts in favor of revision-bound preview.

The cutover should not require destructive database migration. Preview codes, analytics dedup/outbox state, and new settings are additive and safe for the `8.1.x` rollback carrier to understand or ignore as specified. A pre-upgrade backup is required by the deployment guide.

### 12. Delivery slices

Every slice defines its public schemas/OpenAPI before its consumer implementation. M1–M4 may ship only as development/beta work. M5 is the stable public-contract and Ioryogi parity gate; M6 is the separately released headless-only product major.

| Slice                                          | Deliverables                                                                                                                                                                                                                                                                           | Advertised state                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| **M0 — contract and baseline**                 | This ADR; route ownership; complete parity inventory; per-resource auth/cache/limit/pagination and procedure matrices; public DTO/version/capability rules; navigation identity/age bounds; security-header and current-behavior fixtures; backend-call/latency budgets                | No runtime support claimed                    |
| **M1 — SDK and Ioryogi skeleton**              | pnpm package layout, shared schema source, Changesets/publish CI; SDK core/Hono/React Router adapters, version handshake, streaming/SSE proxy, Ioryogi SSR app, `/admin/assets` separation; write-time metric provisioning/backfill; setup/login/admin/media/resources through Ioryogi | Backend integration only                      |
| **M2 — anonymous content and read-only pages** | Public Content API, anonymous pipeline, ETag/CORS/OpenAPI; all read-only pages, SEO, i18n, theme, inline music/thumbhash and body enhancements, public comments/Webmentions, deferred SSR                                                                                              | Read-only external frontend                   |
| **M3 — complete interactions**                 | Comment owner flows, likes, notifications, friend applications, and existing limited admin-scoped public-page operations                                                                                                                                                               | Interactive frontend on the same origin       |
| **M4 — preview, analytics, and observability** | Revision-bound preview, navigation intake with durable dedup/outbox recovery, device-env join, RUM bootstrap/relay, Trace Context                                                                                                                                                      | Preview and analytics parity candidates       |
| **M5 — stable carrier and full parity**        | Cross-repository E2E, compatibility suite, migration/rollback runbook and measured interruption budget, SDK/Ioryogi `1.0.0`, Ioryogi image, Kobato `8.1.0` with stable v1 and the cross-major updater gate; built-in public frontend remains                                           | Stable external frontend plus legacy fallback |
| **M6 — headless-only cutover**                 | Kobato `9.0.0`; legacy document `302 /admin`, legacy public frontend/`content.*` removal, `?draft=true` retirement notes, coordinated upgrade/rollback and SEA smoke                                                                                                                   | Stable headless-only product                  |

### Acceptance gates

A stable M5 release requires every general gate below. An unverified gate means beta, not SDK/Ioryogi `1.0.0` or Kobato `8.1.0` stable contracts. M6 additionally requires the headless-only cutover, updater, release-note, and SEA assertions below.

- **Parity inventory:** every current public behavior is explicitly classified as moved to Ioryogi, retained in Kobato through SDK, or intentionally retired. No item is “unchecked.” The only excluded unfinished capability is the newsletter flow described above.
- **Read-only correctness:** anonymous and logged-in Content API requests return identical representations with no `Set-Cookie`, session activity, search audit, metric creation, draft fallback, or analytics write. Live/visibility/pagination/alias rules have route-level coverage. Creation/backfill/restore fixtures prove stable `interactionKey` continuity, and a deliberately missing key fails without a read-time insert or an empty identifier.
- **Contract compatibility:** public schemas, OpenAPI, SDK DTOs, and real responses agree; old fixtures and old API majors run against the newest backend; unknown compatible fields do not break old SDKs; `backendVersion`, `minimumBackend`, and every initial capability are exercised.
- **Public user journeys:** home/list/detail/archive/search/friends, comments, likes, notifications, visitor auth, admin inline operations, media, inline music metadata, thumbhash/body enhancements, themes, four locales, SEO, feeds, sitemap, OG, CSP/`Accept-CH`/Webmention discovery, bounded thread/Webmention behavior, and no-JS behavior pass through real Ioryogi HTTP.
- **Preview:** RBAC, entity/revision binding, expiry, single use, fragment hygiene, no-store/noindex, no analytics/RUM, and failure responses are proven.
- **Analytics:** document and client navigation, browser-only fallback, prefetch, 304/404/redirect, preview, repeated and conflicting IDs, accepted/ignored replay, admin/bot gates, event-age bounds, device-env joins, and every SQLite/DuckDB crash-recovery point produce exactly the contracted durable counts and events without persisting raw IPs.
- **HTTP/proxy:** streaming binary bodies, unbuffered/cancellable SSE, Range, HEAD, ETag/304, CORS, cookies, CSRF/RBAC, admin assets, long backup restores, error redaction, and manifest-based route/header ownership pass production-like tests.
- **Build and deployment:** both repositories pass formatting, lint, typecheck, unit/integration/browser tests, and production builds. Packed npm artifacts with provenance pass consumer smoke. A real Kobato binary + real Ioryogi SSR/container E2E passes against the immutable `v8.1.0` minimum and the candidate latest build; M5 carrier SEA smoke proves the built-in fallback and M6 SEA smoke proves legacy-document `302 /admin`.
- **Upgrade/rollback:** an existing installation reaches `8.1.x`, cuts over Ioryogi, and then upgrades to `9.0.0` without public URL/media/session/passkey regressions. Both documented rollback paths and the measured maintenance-window budget are exercised; stale/missing cross-major updater confirmation and direct pre-`8.1` → `9.x` update attempts fail closed.
- **Documentation:** support/capability matrices, `minimumBackend: 8.1.0`, minimum/recommended versions, deployment examples, public API docs, the concrete outage budget, `?draft=true` retirement, and release notes are updated in the same release as their capabilities.

## Consequences

- Kobato becomes a focused headless backend with a reusable integration product. Users can obtain the existing admin, endpoints, media, and interactions through the SDK without executing frontend code inside Kobato.
- Ioryogi preserves the complete existing public experience while gaining independent framework, build, deployment, and scaling ownership. Other frameworks can consume the same public contracts.
- A standard deployment now has at least two runtime units. A fresh Kobato binary alone no longer renders a public blog. The official Ioryogi container limits the additional deployment friction but does not remove the second unit.
- Kobato `8.1.0` deliberately carries both the stable public contracts and the built-in frontend for one transition release line. That temporary duplication is the price of a working deploy-Ioryogi-first path and a backend-only rollback; Kobato `9.0.0` removes the old frontend only after that parity gate.
- The compatibility commitment is deliberately strong: every released public API major remains operational in future Kobato majors. This preserves old SDK/Ioryogi deployments at a permanent contract-testing and maintenance cost.
- Public Content API becomes deterministic and cacheable without inheriting session, analytics, audit, or preview behavior. Interaction and viewer state remain private and same-origin. v1 adds no implicit SDK cache and no public library-enumeration endpoints; music and image enhancement data travel inside the content representations that already use them.
- Ioryogi initially retains private, revalidatable HTML rather than pursuing shared HTML caching. Public API caching and server-observed analytics are preserved without introducing anonymous-shell work into the migration.
- Server-observed external analytics requires correct trusted-proxy deployment and a durable dedup/outbox path across SQLite and DuckDB. Accepted events gain replayable exactly-once semantics without persisting raw IPs; delivery before acceptance remains best-effort. This avoids the systematic no-JS/beacon-blocker undercount of a browser-only design at a real recovery/testing cost.
- Revision-bound, single-use preview is more complex than legacy session preview but does not expose admin cookies, long-lived tokens, or draft representations to public caches.
- Inkling becomes a shared editor package. Small UI duplication between the two applications is accepted instead of creating a general component ABI.
- Newsletter remains a separately governed unfinished capability and is not silently advertised as part of the stable SDK.
- Rejected: optional headless alongside a permanently supported built-in public site; a `headless.enabled` mode switch; a separate minimal starter; embedding the Kobato runtime as an npm server dependency; exposing internal `/rpc/*` DTOs as public contracts; general Admin CRUD in the SDK; credentialed cross-origin interactions; tracking page views on content reads; query-string/long-lived preview sessions; a generic `@kobato/ui`; a client-only Ioryogi; and a general Kobato-hosted OTel collector for user applications.
