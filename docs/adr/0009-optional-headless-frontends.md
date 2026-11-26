# ADR-0009: One contract tree for every caller — `kobato` and `sayaka` as two deliverables, contract-first JSON, and the canonical-only oRPC transport

- Status: accepted. Decided 2026-11-25 and **not yet implemented** — the repository still builds one process and one
  binary, so until "Adoption" has landed the tree is what the previous revision described. Every statement below is the
  destination; each section names what moves.
- Date: 2026-11-22; consolidated 2026-11-23 with ADR-0010 (first-party JSON over oRPC, Hono resources) and ADR-0011
  (branded contract procedures, canonical-only transport), whose files are removed. Rewritten 2026-11-25 for the
  `kobato`/`sayaka` split: §1, §2, §3, and §6–§11 are decided anew, and §4, §5, and the type guarantees carry over (§7
  in wording only).
- Related: [ADR-0001](0001-request-and-process-state.md) (its "one request context, three projections" loses the React
  Router projection when sayaka leaves), the consumer guide ([../manual/Headless.md](../manual/Headless.md) — it
  describes the current tree until the adoption lands).

## Context

Kobato ships today as one process and one SEA binary: the public site server-rendered by React Router, the admin,
editor, and auth screens, the oRPC APIs, the resources, and analytics — the frontend mounted inside the Hono app. The
product goal is **headless as a delivery form**: the backend and the public frontend are two independently deployed
deliverables that share one wire. The backend never executes frontend code, business logic is not duplicated, and no
second wire surface exists beside the first.

The seams already exist. `@kobato/api` owns the wire Zod schemas (`src/contracts/`) and the contract tree,
`@kobato/server` implements through the `implement{Public,Authed,Author,Admin}` bases, `@kobato/catalog` owns the public
content read model, and `@kobato/inkling` publishes its document model React-free under `/headless`. What kept headless
a label rather than a delivery form is that no frontend had ever lived on the contract alone:

- The first-party frontend called the router **in process** (`createSsrCaller`), so every perimeter rule had a second,
  faster path to stay consistent with.
- The public origin's resources — feeds, sitemap, images, media — were served by the backend, so a frontend standing at
  the public origin only worked behind a reverse-proxy table.
- The backend carried the frontend framework: sixteen server source files import `react-router`, the public content
  procedures signal a redirect by throwing a `Response`, a domain service throws `redirect('/admin/…')`, and the Hono
  perimeter decides document behavior (trailing slashes, CSP, the install redirect).
- The public site's interactive features — likes, friend apply, notifications, newsletter, in-place comment moderation —
  sat on `account`/`admin` surface, which no external consumer may depend on.
- Sessions knew one origin: sign-in, sign-out, the authentication emails, and passkeys all assume the workspace and the
  public site share `siteIdentity.website`.

The previous revision settled that state as "a consumption mode, not a delivery form" plus a proxy table. This revision
replaces it. It records the split and what follows from it. Three earlier questions stay settled as they were and are
restated for completeness: where a first-party application JSON command/query lives (§3), how a declared contract binds
to its implementation (§4), and whether the pre-grouping `/rpc/*` alias adapter stays (§5 — it does not).

## Decision

### 1. Two deliverables: `kobato` and `sayaka`

Kobato the product ships as two SEA binaries, built from two apps and released together under one version.

**`kobato`** (`apps/kobato`) is the backend: the `/rpc/*` oRPC transport on the Hono perimeter, the operational probes,
and — served by that same Hono app — the admin, editor, and auth screens as a React Router **SPA** (`ssr: false`: a
static client build with a root-only shell; React Router runs no server of its own). Beyond `/rpc/*` and the workspace
it serves nothing: no feed, image, media, or font URL. The workspace is same-origin with its API by construction, so the
session cookie, the CSRF pair, and the WebAuthn relying party stay exactly as they are.

**`sayaka`** (`apps/sayaka`) is the public site: a React Router **SSR** application (`ssr: true`) that renders every
public document and serves every resource the public origin has by calling `kobato` over the public contract. It is the
only listener a browser needs to reach (§9). It stays server-rendered on purpose — SEO meta and `<html lang>`,
document-level ETag/304, streamed comment threads, and the per-request CSP nonce all depend on it.

Neither imports the other. sayaka's only dependency on `kobato` is `@kobato/api` — the contracts and the client
transport — over HTTP; `kobato` never imports sayaka. **Front and back talk in oRPC only**: everything sayaka renders or
serves it gets by calling a procedure. The one thing it passes through is what was never its data to begin with — the
browser's own procedure calls and the workspace (§9). **Headless is this delivery form**: the public frontend is
deployed apart from the backend and reaches it only through the public contract.

Where the code lives:

- `apps/sayaka` absorbs `packages/web/public` and the public half of today's app — the public routes, the document
  runtime, the RUM client, the route warmup, and the public styles. `packages/web/public` does not survive as the public
  site's home.
- `apps/kobato` absorbs `packages/web/admin` and the workspace routes (`admin/`, `editor/`, `auth/`).
- One part of the public tree cannot sink: the modules both deliverables render. The root settings contexts and locale
  sync (`ui/lib`), the editor platform, the notifications, and the logout (`ui/shared`), and the audited admin-reuse set
  stay a workspace package under `packages/web/` — this ADR calls it the cross-surface kit — because `kobato` never
  imports sayaka. sayaka consumes it like any other package.

### 2. The public contract is `publicContract` — the stable surface, and it now includes the public site's interactions

The externally stable surface is the `public` group root of `apiContract` (`@kobato/api/public-contract`), pinned
key-by-key by
[apps/kobato/tests/arch/public-api-contract.test.ts](../../apps/kobato/tests/arch/public-api-contract.test.ts). It grows
in three ways:

- **Four domains are promoted out of `account`: `likes`, `friends`, `notifications`, `newsletter`** — the groups
  [CONTEXT.md](../../CONTEXT.md) lists under Public contract. Tree keys are transport URLs, so they move from
  `/rpc/account/*` to `/rpc/public/*`; the deployed callers are the two deliverables, which release together. `public`
  is a stability boundary, not a guard: each procedure keeps the one it has. `likes.*`, `friends.apply`, and
  `newsletter.*` stay anonymous procedures behind the CSRF guard with their own rate limits; `notifications.*` stays
  `authedProc` (viewer session plus CSRF).
- **The signed-in viewer's own-comment writes join the public `comments` domain.** `updateOwn`, `requestDeleteOwn`, and
  `cancelDeleteOwn` are a second comment-modification surface of the same interface, not workspace surface. The "my
  comments" listing reads (`loadMine`, `searchMineEntities`, `resolveEntity`, `myCounts`) serve a workspace page and
  stay under `account`.
- **The resource procedures of §8 join it.** A frontend standing at a public origin has to serve feeds, the sitemap,
  images, and media there, so producing them is part of the contract, not a backend convenience.

Everything else stays **workspace surface**, free to churn with any release: the whole `admin` subtree and the rest of
`account` — `self`, `passkey`, the `auth` ceremony, `setup`, and the "my comments" reads.

sayaka is a **first-party consumer**. It builds on the stable surface and, for signed-in workspace affordances rendered
inside the public page — approving, editing, and deleting a comment in place; composing and recalling a notification —
reaches a frozen set of `admin` procedures: `admin.comments.{approve,edit,delete}`,
`admin.notifications.{sendDirect,sendBroadcast,recall}`, and `admin.users.list`. That set carries no external guarantee,
cannot grow without a deliberate edit to its pin, and is the only place sayaka touches `admin`. An external frontend
builds the public site from `publicContract`; `createKobatoPublicClient` exposes nothing else at the type level.

Compatibility rides the repository version. Every workspace package carries the backend's version (`pnpm version:sync`),
both binaries are built from one commit, additive changes to public procedures are ordinary minor hygiene, and a
breaking change to the public contract requires a Kobato major. There is no runtime version or capability negotiation:
static typing through the contract tree replaces it for every supported consumer. No SDK packages ship to npm; consumers
consume the workspace source — publishing is a separate decision, taken only when a consumer that cannot live inside the
workspace actually exists.

### 3. First-party application JSON is a contract procedure — and there is no in-process exception

Any first-party application JSON command/query — a state read or mutation in service of the product's own UIs and
consumers — is declared in `@kobato/api` (wire schemas in `src/contracts/`, procedure metadata in `src/rpc/<group>/`),
implemented in `@kobato/server` through the matching `implement{Public,Authed,Author,Admin}` base, and registered in
`apiRouter`, whatever the caller. That includes every loader and resource route of sayaka and every browser call of the
admin SPA: the business call goes through a procedure, never through a direct call into a domain operation service.
Route-local machinery — role guards, install gates, CSRF validation, wire-to-route adaptation — is orchestration on top
of the contract, not a bypass. Internal callers — jobs, sibling domains through the injected seams — keep calling
services directly, and that is out of scope here.

**Every caller reaches it over HTTP.** `createSsrCaller` is deleted. sayaka's loaders and resource routes call
procedures through a **server assembly** in `@kobato/api/client`, beside the existing browser one. It is request-scoped
and ambient-free, like `createKobatoClient`:

- It is created from the inbound document request and forwards what `kobato`'s perimeter needs to derive the same facts
  it derives today — `Cookie`, `User-Agent`, `Accept-Language`, and the visitor's address.
- Conditional requests travel as procedure input (`ifNoneMatch`), as the content reads already do.
- `Set-Cookie` on the RPC response is relayed by the route onto sayaka's response. Cookies travel as real headers on
  both hops — never inside the JSON payload.
- The wire-to-route adaptation — the signal union to a thrown 301/302/304, `ORPCError('NOT_FOUND')` to `notFound()` — is
  sayaka's code.

The rule reaches the browser too. The one call the public site makes today without oRPC — sign-out posts a form to
`/admin/signin` (`use-logout.ts`) — becomes `account.auth.logout`.

Operational endpoints that happen to answer JSON — `/health` and `/ready` — are not application API surface and set no
precedent for JSON business operations on Hono. After §8 they are, with the workspace, all that `kobato`'s Hono app
keeps besides the `/rpc` mount. RUM status and the device beacon are application procedures, not operational Hono
resources.

Retired routes stay retired: the migrated `upload-restore/decrypt`-era paths and the other `RETIRED_JSON_ROUTES` fail
the architecture test
([apps/kobato/tests/arch/api-resource-surface.test.ts](../../apps/kobato/tests/arch/api-resource-surface.test.ts))
wherever they reappear.

### 4. `defineProcedure` is the only production declaration; implementations are checked at compile time

`defineProcedure({ method, path })` in `@kobato/api/rpc/define-procedure.ts` is the single `oc.route` call site in
`src/rpc/`. It returns the untouched oRPC contract procedure, but its `~orpc.route` TYPE keeps the declared method/path
literals — the type parameters are `const`, so a factory building paths from a generic base must type that base as
`` `/${TBase}` `` (`revisionContract<const TBase extends string>(basePath: `/${TBase}`)`): the leading slash stays a
literal in the derived path types instead of widening every revision path to `` `/${string}/…` ``. Schemas chain on from
`src/contracts/` by reference; runtime route, schema, and tree keys are unaffected.

`@kobato/server/http/contract-implementation.ts` derives `ContractImplementation<typeof contract>` — every contract key,
each leaf a `Procedure` over the same input/output schemas carrying the contract's exact route brand — and types each
`implement{Public,Authed,Author,Admin}` factory as a `ContractImplementer` whose leaf `.handler()` result carries the
brand through `.use()` and whose `.router()` accepts only that shape. The loop closes with
`apiRouter = { … } satisfies ContractImplementation<typeof apiContract>`: method/path drift, schema drift, and missing
or extra keys are compile errors, not runtime findings. An unbranded contract leaf makes `ContractImplementation` demand
the unsatisfiable `UnbrandedContractRoute` brand, so a new endpoint cannot slip back to a bare `oc.route` declaration
and silently lose the check; shared route-less factories stay generic over the host base path for the same reason
(`admin/revision-shared.ts`'s `RevisionRouterImplementer<TBase>`). The full-tree parity test
([packages/server/tests/unit/server/http/api-contract.test.ts](../../packages/server/tests/unit/server/http/api-contract.test.ts))
stays as the runtime net.

### 5. Native oRPC over canonical-only `/rpc/*` URLs — no OpenAPI, no legacy aliases

The transport is oRPC's `RPCHandler` (HTTP) and `RPCLink` (clients); the brand is a type-level overlay on the unmodified
oRPC runtime with no new dependency. There is no `OpenAPIHandler`, no runtime route builder, and no REST surface mounted
from the oc.route metadata — the metadata remains a compatibility record, not a served API.

Two URL surfaces, never conflated: (1) the oc.route `method`/`path` metadata declared in `@kobato/api` — the REST-style
wire compatibility record whose values must never drift from deployed URLs; (2) the `/rpc/*` transport URLs, derived by
the handler/client from the ROUTER TREE KEYS (`apiContract.public.content.home` answers at `/rpc/public/content/home`).
Tree keys therefore ARE transport URLs: regrouping the tree moves them.

The grouped `/rpc/{public,account,admin}/*` paths are canonical and the ONLY transport — every in-repo caller and every
headless client uses them, and `app.ts` hands each request straight to the handler. The pre-grouping alias adapter that
once rewrote the 49 legacy URLs is deleted: old spellings no longer match. The CSRF guard runs before routing, so EVERY
legacy path — exempt-read or not — answers 403 to a missing or invalid token; only with a valid CSRF token does the
request reach the handler, which finds no procedure and answers 404. Already-deployed old clients break — accepted: the
alias carried no stability promise, the grouped paths are what this ADR documents for consumers, and keeping the rewrite
would hold the perimeter's dual-spelling complexity (CSRF exemption, tracing, guards) forever.

### 6. One contract, three callers, all over HTTP — and how a frontend feature that depends on the backend is handled

- The browser calls `/rpc/*` same-origin through the `orpc` singleton of `@kobato/api/browser/client` — the admin SPA
  and sayaka's hydrated client alike. On the public origin sayaka forwards that request to `kobato` (§9): it stays one
  oRPC call, which sayaka neither interprets nor re-issues.
- sayaka's server calls `/rpc/*` through the server assembly of §3, with the full RPC URL of a `kobato` backend as its
  configuration.
- An external frontend calls `/rpc/*` from its server through `createKobatoPublicClient` — the headless public seam
  exported by `@kobato/api/client/create-client`. It is the same transport factory as `createKobatoClient` (same
  options, same RPCLink; `url` is the full RPC URL `https://host/rpc`) narrowed to `publicContract`, so external
  consumers call `client.content.*` / `client.comments.*` against the canonical `/rpc/public/*` paths and no
  `account`/`admin` surface is reachable from the returned client — a type-level guarantee. No consumer assembles an
  oRPC link by hand.

No caller has an in-process path, and nothing sayaka serves is a passthrough. That is the rule for every frontend
feature, and it cuts both ways: **a frontend may depend on backend data as strongly as it needs to, through the wire; it
does not depend on the backend process at all** — no in-process call, no shared process state, no assumption that
`kobato`'s perimeter has already run for the document request. Every dependency found in the first-party frontend is one
of three kinds:

- **Something that is the frontend's own moves into sayaka**: document response headers (`http/route-cache-headers.ts`,
  `infra/http/headers.ts`), the `unwrap*` helpers in `http/ssr-caller.ts`, the warmup-manifest reader
  (`render/warmup/manifest.ts` reads the frontend's own client build), the CSP builder, and trailing-slash and
  page-level WordPress-decoy handling.
- **A backend fact the document renders enters the wire**: the RUM bootstrap (`activeFrontendRum()` in the root loader),
  the settings-bundle fallbacks in error boundaries, and install state.
- **Everything else is a procedure sayaka calls** — rendering work and bytes alike (§8). sayaka owns only the HTTP shape
  of what it relays.

One consequence is not optional. Today the first request of an anonymous visitor gets its CSRF token as a side effect of
the Hono perimeter on the document GET, and `content.bootstrap` throws without one. When the first backend contact is an
RPC call, `kobato` must mint the anonymous token on that public read and return it on `responseHeaders`; sayaka relays
the cookie.

### 7. Public semantics are preserved; anonymous-read eligibility is declared in `@kobato/api` and derived by the server

The public contract keeps exactly its current semantics: the Live gate (draft, scheduled, unpublished, and soft-deleted
content invisible), `visible` orthogonality, ETag fingerprinting with `not-modified`/`redirect` signal unions, a page
view recorded for a served document, comment-token cookies, and the stateless `__csrf` double-submit — which guards
every `/rpc/*` call except the anonymous public-read procedures: the seventeen canonical paths (all nine `content.*`
reads plus `comments.loadComments`, `webmentions.list`, `avatar.find`, `github.avatar`, `github.release`,
`images.resolveThumbhash`, `music.get`, `observability.rumStatus`). The resource procedures of §8 — feeds, sitemap,
images, media, and fonts — are anonymous reads and join that set by the same opt-in. The comment-token reads
(`getRaw`/`myComments`), every mutation, and every viewer-session procedure — the promoted `likes`, `friends`,
`newsletter`, and `notifications` domains and the own-comment writes included — keep the full guard, as does the whole
`account`/`admin` surface; an external frontend therefore reads bare while interactive flows remain same-origin cookie +
CSRF. A served document counts a page view no matter who rendered it.

Eligibility for that exemption is declared where the procedure itself is declared:
`defineProcedure(route, { publicRead: true })` writes `publicRead: true` onto the procedure's `~orpc.meta` through
oRPC's own `$meta` chain — never the route compatibility record — with literal fields pinned on the shared
`RpcProcedureMeta` (unmarked procedures stay `NoMeta`). The server's
`packages/server/src/http/request/public-read-rpc-path.ts` contains no path table: it walks `publicContract`, and only
for leaves whose meta carries `publicRead === true` converts the tree key into the canonical `/rpc/public/<key>` path —
the same tree keys the transport routes on, so the exemption cannot disagree with the served URL. It never derives
eligibility from the route metadata, never from the HTTP method (the transport POSTs reads too), and never scans
account/admin; the match stays exact and fail-closed, so a removed alias earns nothing and a newly added GET gains
nothing automatically. Opting a procedure in is a deliberate, security-sensitive API-side change, made loud by freezing
the set in tests on both sides independently of the production derivation:
`packages/api/tests/unit/public-read-meta.test.ts` freezes the exact marked key set (seventeen leaves until the resource
procedures join, and none under `account`/`admin`), and the server's `public-read-rpc-path.test.ts` freezes the same
paths and proves the derived set equals them exactly, tracks the markers leaf-by-leaf, and grants account/admin nothing.
A separate frozen `csrfExempt` set covers only the anonymous device beacon, backup download, and two author music media
GETs; it does not bypass authentication or role guards.

Framework coupling already present in the wire is accepted: listing DTOs carry `seo: MetaDescriptor[]` (React Router
meta descriptors). Consumers not on React Router map them; neutralizing the SEO projection is neither required nor
planned.

### 8. sayaka serves the public origin; `kobato` serves the contract

Every public URL reaches sayaka. Each one it serves itself is implemented by an oRPC call; the two path families it
forwards belong to `kobato` (§9). A document-like resource — a feed, the sitemap, an image — becomes a pair: a `public`
procedure that produces the body and its ETag and answers the same signal union as the content reads (`ok`,
`not-modified`, `redirect`), and a sayaka **resource route** — a route whose loader returns the `Response` — that relays
it. Rendering stays in `kobato`; sayaka owns the HTTP header profile of what it relays and re-emits the content type and
language the procedure names.

| Public URL                                                                    | sayaka serves it through            |
| ----------------------------------------------------------------------------- | ----------------------------------- |
| `/feed`, `/feed/atom`, `/cats/:slug/feed(+/atom)`, `/tags/:slug/feed(+/atom)` | a feed procedure                    |
| `/sitemap.xml`                                                                | a sitemap procedure                 |
| `/robots.txt`, `/manifest.webmanifest`                                        | the settings bundle (a public read) |
| `/images/og/:slug.png`, `/images/og/cats/:slug.png`                           | Open Graph image procedures         |
| `/images/calendar/(dark/):year/:time.png`, `/images/avatar/:hash.png`         | calendar and avatar procedures      |
| the branding assets — `/favicon.*`, `/logo*.svg`, `/apple-touch-icon.png`, …  | branding procedures                 |
| `/storage/*`, `/fonts/embedded/*`                                             | streaming media and font procedures |
| `POST /webmention`                                                            | the Webmention receive procedure    |
| `POST /api/rum/intake/*`                                                      | the RUM intake procedure            |
| `GET /tags` → `/`, `GET /search?q=` → `/search/:keyword` (301)                | no backend call                     |

Nothing is excluded by kind or size, and no resource stays a Hono resource in `kobato` because a first-party payload is
multipart, binary, or streamed. oRPC handles File/Blob multipart bodies, `ReadableStream` responses, and `eventIterator`
SSE, so those application operations belong in the contract tree. Three of the moved URLs deserve their own line:

- **Media and fonts stream through a procedure.** The request carries the range and the validators; the answer is the
  byte stream with its status and headers. An object on S3-primary storage answers with the `redirect` signal, as the
  302 does today.
- **`POST /webmention` is answered by sayaka**, which hands the form to a receive procedure. The earlier exception that
  kept the W3C receive endpoint a Hono resource is withdrawn.
- **The RUM intake is the one foreign protocol sayaka speaks.** It answers the OpenObserve SDK's
  `POST /api/rum/intake/*` with the shape the SDK expects and passes the raw track path, query, and body to the intake
  procedure, which keeps the rate limits, the token injection, and the 202/502 semantics. The OpenObserve endpoint and
  its token stay in `kobato`.

What `kobato`'s Hono app keeps is the `/rpc` mount, `/health`, `/ready`, and the workspace. For the `/api` namespace the
arch test
([apps/kobato/tests/arch/api-resource-surface.test.ts](../../apps/kobato/tests/arch/api-resource-surface.test.ts))
additionally enforces registration: it scans server and web production code for `/api/...` string literals and fails on
anything unregistered, so within that scanned surface a new resource path cannot appear without a deliberate
`RESOURCE_PATHS`/`RESOURCE_PREFIXES` edit in the same change. On `kobato` that registry ends up empty.

### 9. Deployment topology

Kobato runs as two processes, and **sayaka is the only listener a browser needs to reach**. `siteIdentity.website` is
its origin, and it is configured with the full RPC URL of a `kobato` backend. `kobato` serves `/rpc/*`, the workspace,
and its probes, and can sit on a private address. Public URLs, feed URLs, image endpoints, and WordPress-compatibility
routes are preserved as they are.

sayaka does two things with what reaches it:

- **It serves every document and resource itself**, each by calling a procedure (§8).
- **It forwards exactly two path families to `kobato`, untouched** — and nothing else ever reaches `kobato` as a
  request:
  - `/rpc/*` — already an oRPC call made by the browser. Forwarding keeps it one call; sayaka neither interprets nor
    re-issues it.
  - `/admin/*` and `/editor/*` — the workspace is `kobato`'s own surface: its SPA shell, its assets, sign-in, and
    sign-out.

**Why those two.** They are bound to the site origin, and neither can be relayed by sayaka as data. The session cookie
is `SameSite=Lax`; sign-in and sign-out are `/admin/signin`; the magic-link, password-reset, and invitation emails link
to `${siteIdentity.website}/admin/signin`; and the WebAuthn relying party is that same origin (`rpID` is its hostname
and `expectedOrigin` its exact value). The public site leans on the shared session: its user menu links into the
workspace, and notifications, own-comment writes, in-place moderation, and draft preview read the viewer. Forwarding
both families through sayaka keeps all of it on one origin, with nothing outside the two binaries to deploy or
configure.

**Cross-origin read-only deployment** — an external frontend, not sayaka. Its server calls `kobato` directly
(CORS-immune), so documents and every relayed resource work with no proxy at all. Browser-side interaction does not: it
stays same-origin by policy. The existing `security.cors` allowlist (`{ enabled, origins }`, exact origins) remains the
single switch for letting another origin perform anonymous public reads from the browser; cross-origin credentialed
calls are out of scope, and nobody turns `security.csrf` off for this. Full interactive parity means a same-origin
deployment, and an external frontend supplies its own routing to one.

**sayaka is a trusted proxy.** `kobato`'s rate limits, audit, and analytics key on the visitor's address. A call
sayaka's server makes, and a request sayaka forwards, reach `kobato` from sayaka's address unless the visitor's address
travels in a forwarded-address header (`X-Forwarded-For` among them) and sayaka's host is in `security.trustedProxies`.
The server assembly always forwards it; trusting sayaka's host is part of deploying it.

### 10. Scope boundaries

- Draft preview (`?draft=true`, session-gated, per-entity author rules) rides `public.content.pages.bySlug({ draft })`
  behind the forwarded viewer session. sayaka renders it; any same-origin consumer holding a session can.
- Admin, editor, and authentication screens remain `kobato`'s own at `/admin/*` and `/editor/*`; sayaka forwards those
  paths to `kobato` (§9), and an external frontend never reimplements them.
- The stability boundary is the wire, not the components. sayaka is an application, not a kit: nothing outside
  `@kobato/api` and the shared leaves is a compatibility surface.
- sayaka is the reference consumer: public behavior stays testable in one place regardless of how many external
  frontends exist. npm publishing and framework-neutral SEO, if ever genuinely required, arrive as their own decisions.

### 11. `kobato` knows no frontend framework

`packages/server` imports no `react-router`. The React Router server glue leaves with the frontends or is deleted: the
mount (`infra/hono/*`), `http/ssr-caller.ts`, the React Router context key and `guardOnlyLoader` in
`http/request-context.ts`, `buildLoadContext` in the middleware pipeline, the header helpers,
`render/warmup/manifest.ts`, and `infra/trace/react-router.ts`. Three places are not glue and change shape instead:

- **Procedure control flow is wire-shaped end to end.** `http/loaders/*` return the signal union; they no longer throw
  `Response`s for `translateThrownResponse` to translate.
- **No domain service throws a redirect.** `domains/settings/install-gate.ts` stops throwing `redirect('/admin/…')`;
  install state is a wire value the workspace acts on.
- **The session container is `kobato`'s own**, not React Router's `createSession`.

What `kobato` may know about a frontend splits in two. The workspace ships inside `kobato`, so its URL grammar —
`/admin/*`, `/editor/*`, the `account.auth` and `account.setup` redirect targets — is workspace-internal and stays. The
public site's document behavior — trailing slashes, the page-level WordPress decoy, document CSP and HSTS — is sayaka's,
and `kobato`'s install gate covers only what `kobato` serves. Public URLs the contract hands out (post links, feed
scopes, image paths) are contract data and stay.

`RequestContext` ([ADR-0001](0001-request-and-process-state.md)) keeps two projections in `kobato` — the Hono variable
and the oRPC `HandlerContext`. sayaka derives its own document-request facts from the inbound request and from what
`content.bootstrap` returns. React itself stays in `kobato` for email templates; the rule is about the router.

## What the types guarantee — and what they do not

- **Compile-time, zero runtime cost**: method/path/schema/key conformance of every implemented router to the contract
  tree, fail-closed on unbranded leaves, generic revision factories pinned to their exact base paths, and the literal
  `publicRead` meta type on marked procedures.
- **Still runtime-pinned, deliberately**: the two concentrated type assertions — the brand assertion in
  `defineProcedure` (its single `as` claiming the untouched `oc.route` value carries the literal `~orpc.route` type) and
  the implementer assertion in `contractImplementer` (that the oRPC implementer runtime copies each contract leaf's
  `~orpc`, route and meta included, into the built procedure, and that `impl.router()` rebuilds leaves with that same
  route) — are pinned by the identity tests: `packages/api/tests/unit/define-procedure.test.ts` is the tripwire for the
  factory's `as`, and the full-tree parity `packages/server/tests/unit/server/http/api-contract.test.ts` is the tripwire
  for the implementer assertion. Types do not execute the server: procedure matching, the CSRF exemption, and the guards
  are pinned by the real-HTTP mount suites (`packages/server/tests/it/server/http/rpc-canonical-paths.test.ts`,
  `bootstrap-cold-hydration.test.ts`).
- **oRPC-internal coupling**: `contractImplementer` builds on `implementerInternal` and oRPC's internal def types; an
  oRPC upgrade can invalidate those assumptions. The same runtime tests are the tripwire — the trade is accepted because
  the alternative (a runtime route registry) gives up compile-time checking entirely for a dependency surface of the
  same size.

## Rejected alternatives

- **One binary embedding sayaka's server build.** Keeps the in-process mount `createSsrCaller` grew in: the frontend is
  never forced onto the contract, and "an external frontend can do everything sayaka does" stays unproven. Two binaries
  make it true by construction.
- **The public site as a SPA.** Loses SEO meta, document-level ETag/304, streamed comment threads, and the per-request
  CSP nonce.
- **The admin as a separate server-rendered app.** Nothing it renders needs server rendering, and a second origin would
  move session, CSRF, and WebAuthn semantics across it.
- **`kobato` importing sayaka** for the modules both render. An app importing an app; the cross-surface kit exists so it
  never has to.
- **Keeping an in-process caller for first-party frontends.** One contract with two policy sets is two contracts waiting
  to diverge: an in-process path skips the perimeter every HTTP caller pays, guards nothing, and invites a future caller
  to claim it.
- **Forwarding no request at all.** The browser's procedure calls and the workspace are bound to the site origin —
  sessions, the authentication emails, and passkeys. Without forwarding them, sayaka would have to answer the contract
  itself and grow a sign-in flow of its own, or `kobato` would need a public hostname with a deployer's proxy in front
  of both.
- **Keeping media, fonts, the Webmention endpoint, or the RUM relay as `kobato` resources.** They would be the one place
  a public URL is not an oRPC call. Range requests, immutable caching, and a foreign protocol are carried by procedures
  instead.
- **sayaka on the stable surface alone, dropping in-place moderation.** sayaka would touch no workspace surface, but a
  signed-in admin would lose approving, editing, and deleting a comment where it appears. The frozen first-party set
  keeps the affordance without giving it a guarantee.
- **Promoting the moderation procedures into the stable surface.** Back-office writes are not a public-site wire.
- **Leaving feeds, sitemap, and images on `kobato` behind the proxy table.** A frontend standing at a public origin must
  serve them there; a proxy rule per resource is the operational burden this revision removes.
- **Generating feeds and sitemaps in sayaka from structured data.** Duplicates backend rendering — the duplication this
  boundary exists to prevent.
- **A parallel versioned REST content API, an `OpenAPIHandler`, or REST generated from the oc.route metadata.** A second
  wire face kept eternally in agreement with the contract tree, which is already the single source for every caller —
  rejected for external consumers and for the internal surface alike.
- **A parallel Hono JSON API for application operations, or domain services called directly from frontend routes.**
  Either skips what the contract tree owns once — input validation, error descriptors, auth gates, rate limits, trace
  spans — one layer closer to home than the REST variant.
- **An SSR-only schema family** (loader-output types declared separately from the wire). Two declarations of one
  procedure drift; where output unions exist, they live in the same `@kobato/api/contracts` modules as the wire.
- **A runtime route registry or builder** (derive handlers from a runtime table instead of type brands). Moves the truth
  from compile time to runtime, duplicates what the contract tree already declares, and buys nothing the parity test
  does not already cover.
- **Enforcing `defineProcedure` by lint alone.** A lint rule catches the declaration site but not implementation drift;
  the fail-closed mapped type catches both at the same cost.
- **Keeping the legacy alias adapter indefinitely.** A permanent dual-URL surface: every perimeter rule reasons about
  two spellings of one procedure, and the per-procedure comments table was a second registry to keep in sync.
- **Keeping the hand-listed server-side exemption table.** A second registry of procedure identity beside the contract
  tree: a renamed or regrouped public procedure would leave a stale exempt path, while a newly declared public read
  would silently answer 403 to anonymous callers until someone edited the table. Deriving the set from the declared
  `~orpc.meta.publicRead` marker keeps one source of truth; the deliberate-opt-in property is preserved by freezing the
  marked keys/paths in tests on both sides, not by maintaining a table.
- **SDK packages on npm.** Consumers use the workspace packages; publishing solves a problem no current consumer has.
- **An official frontend in another repository.** sayaka is the official frontend and lives here; a second official
  frontend is pure parity cost.
- **A configurable forwarding table or route manifest.** The two path families sayaka forwards are fixed by this
  boundary, not a list a deployer maintains; every other public URL is code.
- **Runtime version and capability negotiation.** Repo-wide version sync already makes package version identical to
  backend version; static typing covers every supported consumer.
- **A revision-bound, one-time-code preview exchange.** Complexity that serves no current consumer; draft preview rides
  the forwarded session.

## Consequences

- sayaka lives or dies by the public contract: a gap shows up first in the first-party frontend, during development,
  rather than in an external consumer's production. It stays the parity reference, so public behavior is testable in one
  place however many external frontends exist.
- Every public byte passes through sayaka as a procedure answer. Media and fonts pay a second hop and an oRPC
  serialization that a byte passthrough would not, and Range requests become contract shapes — the accepted price of one
  wire.
- A deployment runs two processes and configures no proxy. sayaka is the only listener browsers reach, and the routing
  that keeps sessions, the authentication emails, and passkeys on one origin is inside it; `kobato` can sit on a private
  address. That is two forwarded path families inside sayaka, down from a proxy table with one row per public resource.
- A frontend feature that needs something from `kobato` has exactly one route — a procedure — and §6 decides where the
  code lives. The residual risk is discipline: an in-process shortcut, a process-state read inside a loader, or a
  forwarded path outside the two families of §9 is the failure mode, and the arch pins are what catch it — sayaka's
  routes and components import no `@kobato/server`, and `packages/server/src` imports no `react-router`.
- Every document render gains a network hop and a serialization pass per procedure call between sayaka and `kobato`,
  where the in-process caller had neither.
- Rate limits, audit, and analytics see the visitor only when the address is forwarded and the intermediary is trusted
  (§9).
- Perimeter policy is uniform by construction — there is no second transport to keep consistent. Per-route needs stay
  explicit, reviewable overrides (the restore 30-minute timeouts, the decrypt 64 KiB body limit) rather than silent
  exemptions.
- Adding first-party application JSON functionality touches `@kobato/api` and the server controller; method/path/schema/
  key drift fails at compile time, with the full-tree parity test and arch pins as the runtime net. The residual risk is
  review discipline — a "quick JSON endpoint" on a resource is precisely the failure mode the registry and this ADR
  exist to catch.
- Anonymous-read eligibility lives with the procedure declaration (`~orpc.meta.publicRead`), so adding the marker to a
  sensitive procedure is a one-line API-side change — the freeze tests on both sides are what make that line loud.
  Removing a marker breaks deployed consumers and fails the same tests. Streaming media and font reads join the
  anonymous set, so that pin grows with §8.
- One build per surface. The machinery that existed because the public site and the workspace shared one document —
  `admin-subset.css`, `useDetachPublicCss`, the `layout: 'admin'` route handle, catalog-scope switching in
  `shouldRevalidate`, admin-tier chunk selection in the root loader — goes away. The shared origin does not: it is what
  keeps one session across both.
- Already-deployed callers of `/rpc/account/{likes,friends,notifications,newsletter}/*` and of the own-comment writes
  move with the promotion; the two deliverables release together.
- External consumers get a typed, schema-first wire for free — now including the public site's viewer interactions
  (likes, friend apply, notifications, newsletter, and signed-in comment management) — and accept its document-oriented
  semantics (page views on reads, React Router-shaped SEO) rather than a neutralized data API. Cross-origin deployment
  is read-only by policy; full interactive parity means a same-origin deployment. That is scope control, not a
  limitation scheduled to be fixed.
- The residual type risk is concentrated in the two assertions (the `defineProcedure` brand `as` and the
  `contractImplementer` implementer assertion) plus the oRPC-internal type coupling, and all are named, tested failure
  modes rather than folklore.

## Adoption

The order below keeps every step green on its own. Steps 3 and 5 are independent of each other once step 2 has landed.

1. **`kobato` stops using React Router for control flow** (§11). `http/loaders/*` return the signal union,
   `translateThrownResponse` goes, no domain service throws a redirect, and the session container stops using
   `createSession`. No wire shape changes.
2. **The wire carries what the document needs** (§3, §6). `@kobato/api` gains the server assembly; `kobato` mints the
   anonymous CSRF token on a public read; `content.bootstrap` carries the RUM bootstrap and install state; sign-out
   becomes `account.auth.logout`.
3. **`apps/sayaka`** (§1, §6, §9). The public routes, the document runtime, the RUM client, the warmup, and the public
   component tree move; `createSsrCaller` is deleted; the document perimeter (headers, CSP, trailing slash, decoy) moves
   with them; sayaka forwards `/rpc/*`, `/admin/*`, and `/editor/*` to `kobato`, so the workspace stays on the site
   origin. The cross-surface kit is carved out, and `apps/inkling-demo` follows the two public modules and the public
   stylesheet it reaches.
4. **Every public URL becomes a procedure pair**, family by family (§8): redirects; robots and manifest; feeds and
   sitemap; images and branding; media and fonts; the Webmention receive; the RUM intake. Each family adds its
   procedures, adds its sayaka routes, deletes its `kobato` router, and re-pins `public-api-contract`,
   `public-read-meta`, the server's path derivation, and the resource registry.
5. **The admin SPA** (§1). `ssr: false`; the guard-only loaders disappear; the loaders that carry data and the signin
   and setup actions move into the browser over `account.*`; `kobato` serves the static build behind its install gate.
6. **Promotion** (§2). `likes`, `friends`, `notifications`, and `newsletter` move under `public`, and the own-comment
   writes join `comments`; the first-party set is frozen.
7. **Two binaries, and the documents.** A second SEA pipeline builds `sayaka` (`tools/pack`); the live-instance suites
   drive two processes behind one sayaka listener; `packages/server/src` imports no `react-router` and a pin keeps it
   so. The companions follow — the consumer guide, the `AGENTS.md` tree, and an amendment to ADR-0001.
