# ADR-0009: One contract tree for every caller — headless frontends, contract-first JSON, and the canonical-only oRPC transport

- Status: accepted
- Date: 2026-11-22; consolidated 2026-11-23 with ADR-0010 (first-party JSON over oRPC, Hono resources) and ADR-0011
  (branded contract procedures, canonical-only transport), whose files are removed — this document is the current state,
  not a history of the three.
- Related: [ADR-0001](0001-request-and-process-state.md), the consumer guide
  ([../manual/Headless.md](../manual/Headless.md))

## Context

Kobato ships as one process and one SEA binary: built-in public site, admin/editor/auth SPA, oRPC APIs, resources,
analytics. The product goal: an independently deployed frontend can render the public site against the same backend —
without the backend executing frontend code, without duplicating business logic, and without maintaining a second wire
surface beside the first.

The architecture provides the seams: `@kobato/api` owns the wire Zod schemas (`src/contracts/`) and the contract tree,
the server implements through the `implement{Public,Authed,Author,Admin}` bases, `@kobato/catalog` owns the public
content read model, `@kobato/inkling` publishes its document model React-free under `/headless`, and
`@kobato/web-public` renders the public site without ever importing the server.

Three questions were folklore rather than recorded decisions, and this ADR settles all three as one coherent boundary:

1. Which procedures carry a stability guarantee for external consumers, how compatibility is versioned, and which
   deployment topologies are supported.
2. Where a first-party application JSON command/query must live, and what justifies a Hono resource beside the contract
   tree — application JSON operations had accreted on the resource face (backup restore status/progress, parked-upload
   decrypt, branding clear) before migrating to procedures.
3. How the declared contract binds to the implementation — oRPC's own `ContractProcedureDef.route` is the wide `Route`
   type, so method/path drift once type-checked cleanly — and whether the pre-grouping legacy `/rpc/*` alias adapter,
   which made every perimeter rule reason about two spellings of one procedure, stays or goes.

## Decision

### 1. Headless is a consumption mode, not a delivery form

The delivery form is unchanged: one process, one SEA binary, built-in public site, admin/editor/auth SPA, resources,
analytics (ADR-0001). "Headless" means an externally deployed frontend renders the public site by calling the backend's
public procedures over HTTP — nothing more. There is no runtime switch, no separate build target, and no `headless`
settings section: public procedures are always mounted, and an external frontend is simply another caller.

### 2. The public contract is the `public` subtree of `apiContract` — the only externally stable surface

The headless wire surface is the existing oRPC contract tree mounted at `/rpc/*`, not a parallel REST API. It is
`publicContract` — the `public` group root of `apiContract`, composed in `@kobato/api/public-contract.ts` — whose nine
domains are `content`, `comments` (the public comment thread plus the comment-token procedures), `webmentions`,
`avatar`, `github`, `images`, and `music`. The last four are the built-in renderer's own read helpers (music player
metadata, thumbhash resolution, release/avatar lookups): they sit on the public read face as deployed wire shapes, and
the guarantee covers them exactly as pinned.

Two exceptions inside `public` are deliberate and test-pinned: the three deployed comment mutations (`replyComment`,
`edit`, `revokeToken`) and the comment-token reads (`getRaw`, `myComments`) — anonymous interactive procedures the
public comment thread needs; and the Webmention receive endpoint, which is a Hono resource (`POST /webmention`), never
an RPC — `webmentions.list` is the only webmentions procedure.

Everything else is **workspace surface**, free to churn with any release: the whole `admin` subtree (including
`analytics`), and the `account` subtree — the shipped SPA's own auth (`self` at the root, `passkey`
`authBegin`/`authFinish`, the `auth` sign-in ceremony — status/identify/login/logout/magic-link/OTP/password-reset — and
the `setup` install flow — status/verify-token/install) plus the viewer workspace (`comments` authed-only,
`notifications`, `likes`, `friends`, `newsletter`). Several account procedures — the sign-in/install ceremonies and the
anonymous self-service writes alike (like increase/decrease, friend apply, newsletter subscribe) — carry their own
guards and rate limits and stay behind the CSRF guard: placing them under `account` is audience grouping in the tree,
not a guard change — and none of them is part of the external headless stable surface.

An arch test
([apps/kobato/tests/arch/public-api-contract.test.ts](../../apps/kobato/tests/arch/public-api-contract.test.ts)) pins
the public group and procedure list — exact keys, oc.route methods/paths, and canonical `/rpc/public/*` transport paths
— so additions and removals to the guaranteed set become deliberate acts reviewed against this ADR.

Compatibility rides the repository version. Every workspace package carries the same version as the backend
(`pnpm version:sync`); an external consumer pins the packages matching its backend, additive changes to public
procedures are ordinary minor hygiene, and a breaking change to the public contract requires a Kobato major. There is no
runtime version or capability negotiation: static typing through the contract tree replaces it for every supported
consumer. No SDK packages ship to npm; consumers consume the workspace source — publishing is a separate decision, taken
only when a consumer that cannot live inside the workspace actually exists.

### 3. First-party application JSON is a contract procedure — no second application JSON API

Any first-party application JSON command/query — a state read or mutation in service of the product's own UIs and
consumers — is declared in `@kobato/api` (wire schemas in `src/contracts/`, procedure metadata in `src/rpc/<group>/`),
implemented in `@kobato/server` through the matching `implement{Public,Authed,Author,Admin}` base, and registered in
`apiRouter`, whatever the caller. That includes React Router loaders and form actions wherever they fetch business data
or change state: the business call goes through a procedure, not through a direct call into a domain operation service.
Route-local machinery — role guards (`requireRole`), install gates, CSRF validation, wire-to-route adaptation such as
`auth/flow-response.ts` — is orchestration on top of the contract, not a bypass. On the HTTP and SSR request surface, a
domain operation service gains no second entry point beside its contract; internal callers — jobs, sibling domains
through the injected seams — keep calling services directly, and that is out of scope here.

Operational and protocol endpoints that happen to answer JSON — `/health`, `/ready`, and the OpenObserve RUM intake —
are not application API surface. §8 owns them, and they set no precedent for JSON business operations on Hono. RUM
status and the device beacon are application procedures, not operational Hono resources.

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

### 6. One contract, three callers; SSR in-process is a transport optimization, not a policy exception

- The browser calls `/rpc/*` same-origin through the `orpc` singleton of `@kobato/api/browser/client` (the full-tree
  `ContractRouterClient` over the grouped `apiContract`, including the workspace surfaces the built-in SPA needs).
- The built-in frontend's SSR calls the same `apiRouter` in process through `createSsrCaller` — a performance seam, not
  a privilege. It builds the same `HandlerContext` from the canonical `RequestContext` (ADR-0001) and invokes the same
  router with the same interceptors (input validation; tracing under the `in_process` label), skipping only the HTTP
  hop. The React Router request itself still traverses the perimeter middleware — request context derivation, install
  gate, session, CSRF (the global `csrfGuard` for `/rpc/*`; form actions keep their own `validateCsrfForAction`),
  request timeout, CSP and security headers, logging — and body limits stay mount-scoped (`dynamicBodyLimit` on the
  `/rpc` mount, per-resource caps on the resources). There is no in-process fast lane. This includes the auth routes:
  the signin/setup loaders and form actions drive `account.auth.*`, `account.setup.*`, and
  `account.passkey.authBegin`/`authFinish` over the same in-process router, with `flow-response` doing only
  wire-to-route adaptation — there is no second authentication interface beside the contract, and none of these
  procedures joins the headless public seam.
- An external frontend calls `/rpc/*` from its server through `createKobatoPublicClient` — the headless public seam
  exported by `@kobato/api/client/create-client.ts`. It is the same transport factory as `createKobatoClient` (same
  options, same RPCLink; `url` is the full RPC URL `https://host/rpc`) narrowed to `publicContract`, so external
  consumers call `client.content.*` / `client.comments.*` against the canonical `/rpc/public/*` paths and no
  `account`/`admin` surface is reachable from the returned client — a type-level guarantee. No consumer assembles an
  oRPC link by hand; the factory keeps every caller on the same transport, and the stability semantics of §2 are
  unchanged by which transport invokes them.

The `responseHeaders` adaptation is part of the contract's behavior, kept on both transports: controllers stage
out-of-band headers (session cookies from auth flows, refreshed comment tokens) on `context.responseHeaders`; the
`/rpc/*` mount merges them into the outgoing `Response` (`Set-Cookie` appended, everything else set), and SSR routes
merge them into `redirect`/`data`. Cookies travel as real headers whether the transport was HTTP or in process — never
inside the JSON payload.

### 7. Public semantics are preserved; anonymous-read eligibility is declared in `@kobato/api` and derived by the server

The public contract keeps exactly its current semantics: the Live gate (draft, scheduled, unpublished, and soft-deleted
content invisible), `visible` orthogonality, ETag fingerprinting with `not-modified`/`redirect` signal unions, a page
view recorded for a served document, comment-token cookies, and the stateless `__csrf` double-submit — which guards
every `/rpc/*` call except the anonymous public-read procedures: the seventeen canonical paths (all nine `content.*`
reads plus `comments.loadComments`, `webmentions.list`, `avatar.find`, `github.avatar`, `github.release`,
`images.resolveThumbhash`, `music.get`, `observability.rumStatus`). The comment-token reads (`getRaw`/`myComments`),
every mutation, and the whole `account`/`admin` surface keep the full guard; a headless consumer therefore reads bare
while interactive comment flows remain same-origin cookie + CSRF. A served document counts a page view no matter who
rendered it.

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
`packages/api/tests/unit/public-read-meta.test.ts` freezes the seventeen marked keys (and proves account/admin carry
none), and the server's `public-read-rpc-path.test.ts` freezes the seventeen expected canonical paths and proves the
derived set equals them exactly, tracks the markers leaf-by-leaf, and grants account/admin nothing. A separate frozen
`csrfExempt` set covers only the anonymous device beacon, backup download, and two author music media GETs; it does not
bypass authentication or role guards.

Framework coupling already present in the wire is accepted: listing DTOs carry `seo: MetaDescriptor[]` (React Router
meta descriptors). Consumers not on React Router map them; neutralizing the SEO projection is neither required nor
planned.

### 8. Hono resources are limited to external protocols, preserved public URLs, and operations

A resource is justified only by an external protocol, a preserved public URL, or an operational role — never by a
first-party payload being multipart, binary, or streamed. oRPC handles File/Blob multipart bodies, `ReadableStream`
responses, and `eventIterator` SSE, so those application operations all belong in the contract tree.

The remaining registry, by justification:

- **External protocols**: `POST /webmention` (the W3C receive endpoint, never an RPC per §2), and the OpenObserve RUM
  intake relay `POST /api/rum/intake/*`. The relay must preserve the SDK's raw track path, query, body, content
  encoding, rate limits, token injection, and 202/502 semantics. RUM status is instead `public.observability.rumStatus`.
- **Preserved public URLs serving binary or generated output**: the six feed URLs, `/sitemap.xml`,
  `/manifest.webmanifest`, `/robots.txt`, `/storage/*` (with the S3 storage redirect), `/fonts/embedded/*`,
  `/images/og/*` and the calendar image endpoints, plus the legacy `/tags` and `/search` redirects kept for
  WordPress-compatibility URL preservation.
- **Operational probes**: `/health` and `/ready` on the middleware pipeline itself — infrastructure endpoints outside
  the application API.

Every former first-party upload, download, SSE, and beacon is now a procedure: branding/font/GeoIP/backup/setup
multipart uploads, streamed backup download and author music media, `admin.analytics.events` as an `eventIterator`,
`public.analytics.recordDeviceEnv` as a standard-envelope `sendBeacon`, and RUM status as a `publicRead`. Binary GETs
that must work from `<img>`, `<audio>`, or `window.open` use the separate, exact-path `csrfExempt` declaration while
retaining their admin/author guards; the anonymous beacon uses the same declaration for its legacy header-less write.

Backup remains the reference case: status/progress, upload/decrypt, upload, download, and stored-backup restore are all
procedures. Upload/decrypt and setup restore keep their independent rate limiters, body caps declared as
`requestBodyLimit`, and 30-minute timeouts declared as `requestTimeoutMs`; download keeps `getBackupStream` and its
attachment headers. Install gate and self-telemetry exemptions are likewise derived from procedure metadata, never
parallel path tables. Browser upload progress uses XHR only as a transport detail, with the API package's standard RPC
serializer rather than a second wire protocol.

A new Hono resource requires a justification from this section, stated where the resource is declared. For the `/api`
namespace, the arch test
([apps/kobato/tests/arch/api-resource-surface.test.ts](../../apps/kobato/tests/arch/api-resource-surface.test.ts))
additionally enforces registration: it scans server and web production code for `/api/...` string literals and fails on
anything unregistered, so within that scanned surface a new resource path cannot appear without a deliberate
`RESOURCE_PATHS`/`RESOURCE_PREFIXES` edit in the same change. Resources outside `/api` rest on review, not on this test;
the scan's two deliberate exemption kinds are the outbound third-party music/observability prefixes and the RUM client's
`rum-url-policy.ts`, which builds the registered intake URL by policy.

### 9. Deployment topology

The default is unchanged: one origin, the built-in site; `siteIdentity.website` remains the canonical origin, and public
URLs, feeds, image endpoints, and WordPress-compatibility routes are preserved as they are.

**Same-origin interactive deployment.** An external frontend acts as the public entry and forwards the Kobato-owned
paths (`/rpc/*`, `/admin/*` and `/editor/*` including the auth screens, `/storage/*`, `/fonts/*`, `/images/*`, `/api/*`
intakes, feeds, sitemap) to the backend. No forwarding middleware ships with Kobato; the integration guide
([../manual/Headless.md](../manual/Headless.md)) carries the reference reverse-proxy table. Credentialed interaction in
this topology is the comment thread — the `__comment_tokens` cookie and the CSRF-protected comment writes — plus the
session-bearing workspace itself; cookie, CSRF, and WebAuthn semantics stay same-origin and untouched. Likes and viewer
notifications are `account` workspace surface and are not part of the external headless stable surface; if an external
frontend forwards `/rpc/*` wholesale, they keep working for the built-in workspace without gaining an external
guarantee.

**Cross-origin read-only deployment.** The existing `security.cors` allowlist (`{ enabled, origins }`, exact origins) is
the single switch for letting another origin perform anonymous public reads from the browser. Two limits are policy, not
gaps to be fixed: cross-origin credentialed calls are out of scope (session, CSRF, and comment-token cookies are
`SameSite=Lax` and stay on the Kobato origin), and the §7 CSRF exemption covers exactly the anonymous public-read
procedures — so a foreign origin's browser reads the public contract with `security.cors` alone (never turn
`security.csrf` off for this), while a server-side consumer (CORS-immune) is an equally supported cross-origin caller.
Full interactive parity means a same-origin deployment.

### 10. Scope boundaries

- Draft preview (`?draft=true`, session-gated, per-entity author rules) stays a built-in-frontend capability; external
  frontends render Live content only. If an external preview need materializes, it gets its own ADR.
- Admin, editor, and authentication screens remain Kobato's own at `/admin/*` and `/editor/*`; an external frontend
  never reimplements them, and WebAuthn keeps binding to `siteIdentity.website`.
- The stability boundary is the wire, not the components. An external frontend may reuse `@kobato/web-public` and the
  other workspace packages, but only the public contract groups carry the compatibility guarantee.
- Feeds, sitemap, storage, fonts, images, OG, the RUM relay, and analytics intakes stay Kobato-owned HTTP resources; an
  external frontend links to them or calls them as documented endpoints, and never re-hosts them.

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

- **Headless-only delivery with a migration program.** The built-in site is the reference consumer and the rollback
  target; removing it buys nothing once the contract is shared.
- **A parallel versioned REST content API, an `OpenAPIHandler`, or REST generated from the oc.route metadata.** A second
  wire face kept eternally in agreement with the contract tree, which is already the single source for browser, SSR, and
  server — rejected for external consumers and for the internal surface alike.
- **A parallel Hono JSON API for application operations, or domain services called directly from React Router routes.**
  Either skips what the contract tree owns once — input validation, error descriptors, auth gates, rate limits, trace
  spans — one layer closer to home than the REST variant. The sign-in/install migration onto
  `account.auth.*`/`account.setup.*` is the working precedent for route flows driving procedures in process.
- **An SSR-only schema family** (loader-output types declared separately from the wire). Two declarations of one
  procedure drift; where SSR output unions exist, they live in the same `@kobato/api/contracts` modules as the wire.
- **Multipart uploads inside oRPC, or streams/SSE as procedures.** Uploads sit on Hono for the machinery the transport
  side owns outright — explicit per-resource body caps, stream staging with progress, parked-upload flows — and bytes
  stay out of JSON payloads, where base64 disguises them as text and inflates them; long-lived responses are
  response-shape control kept on the transport for framing and stream lifetime. Both are placement choices on transport
  grounds, not claims about what procedures could express.
- **Exempting the in-process caller from perimeter policy.** One contract with two policy sets is two contracts waiting
  to diverge; the RR request pays the perimeter anyway, so an SSR exemption would guard nothing while inviting a future
  caller to claim it.
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
- **An official external frontend repository.** Any frontend — fork, custom build, or the built-in one — consumes the
  same contract; maintaining a second official frontend is pure parity cost.
- **Route-forwarding middleware and a route manifest.** Same-origin deployment is a documented proxy table, not shipped
  code the backend must keep correct for every host framework.
- **Runtime version and capability negotiation.** Repo-wide version sync already makes package version identical to
  backend version; static typing covers every supported consumer.
- **A revision-bound, one-time-code preview exchange.** Complexity that serves no current consumer; external frontends
  render Live content only.

## Consequences

- Headless support is one arch test, one client factory, and documentation instead of a migration program; the residual
  risk is discipline — public-contract changes must stay additive until a Kobato major says otherwise.
- Adding first-party application JSON functionality touches `@kobato/api` and the server controller; method/path/schema/
  key drift fails at compile time, with the full-tree parity test and arch pins as the runtime net. Resources stay rare,
  reviewed additions — within the scanned `/api` surface, their paths are pinned by the arch test in the same change.
  The residual risk is review discipline — a "quick JSON endpoint" on a resource is precisely the failure mode the
  registry and this ADR exist to catch.
- Perimeter policy stays uniform across transports because both faces run through one pipeline; per-route needs are
  declared as explicit, reviewable overrides (the restore 30-minute timeouts, the decrypt 64 KiB body limit) rather than
  silent exemptions.
- Anonymous-read eligibility lives with the procedure declaration (`~orpc.meta.publicRead`), so adding the marker to a
  sensitive procedure is a one-line API change — the freeze tests on both sides are what make that line loud. Removing a
  marker breaks deployed headless consumers and fails the same tests.
- Already-deployed clients calling pre-grouping `/rpc/*` URLs break (404/403) — a deliberate break, accepted against the
  permanent dual-spelling complexity the alias adapter imposed on every perimeter rule.
- The residual type risk is concentrated in the two assertions (the `defineProcedure` brand `as` and the
  `contractImplementer` implementer assertion) plus the oRPC-internal type coupling, and all are named, tested failure
  modes rather than folklore.
- External consumers get a typed, schema-first wire for free, and accept its document-oriented semantics — page views on
  reads, React Router-shaped SEO — rather than a neutralized data API. Cross-origin deployment is read-only by policy;
  interactive external frontends deploy same-origin behind a proxy. That is scope control, not a limitation scheduled to
  be fixed.
- The built-in public frontend remains the parity reference, so public behavior stays testable in one place regardless
  of how many external frontends exist. npm publishing and framework-neutral SEO, if ever genuinely required, arrive as
  their own decisions on top of this boundary.
