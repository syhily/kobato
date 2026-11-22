# ADR-0010: First-party application JSON over oRPC; Hono resources for transport and protocol needs

- Status: accepted
- Date: 2026-11-23
- Related: [ADR-0001](0001-request-and-process-state.md), [ADR-0009](0009-optional-headless-frontends.md)

## Context

Kobato's HTTP perimeter presents two faces. The oRPC contract tree — declared in `@kobato/api`, implemented by
`apiRouter` in `@kobato/server` — carries the first-party application JSON surface, mounted at `/rpc/*` with three
callers (ADR-0009 §4). Beside it, the Hono `http/resources/` modules serve payloads and protocols the project keeps off
the contract tree: multipart uploads, binary streams, SSE, external protocols, preserved public URLs, and operational
probes.

Where the line between the two faces sits was folklore rather than a recorded decision. Application JSON operations had
accreted on the resource face — backup restore status/progress, the parked-upload decrypt, and branding clear were Hono
JSON routes even though nothing about them needed a non-JSON transport. They have since migrated to procedures
(`admin.backup.restoreStatus` / `restoreProgress` / `uploadRestoreDecrypt`, `admin.branding.clear`), and
[apps/kobato/tests/arch/api-resource-surface.test.ts](../../apps/kobato/tests/arch/api-resource-surface.test.ts) rejects
their retired routes and any unregistered first-party `/api` literal in its scanned server and web production surface.

This ADR records the boundary as a standing rule, so the next endpoint does not relitigate it: where a first-party
application JSON command/query must live, what justifies a Hono resource, and which concerns the Hono perimeter keeps
owning on every transport.

## Decision

### 1. First-party application JSON command/query is a contract procedure — no second application JSON API

Any first-party application JSON command/query — a state read or mutation in service of the product's own UIs and
consumers — is declared in `@kobato/api` (wire schemas in `src/contracts/`, procedure metadata in `src/rpc/<group>/`),
implemented in `@kobato/server` through the matching `implement{Public,Authed,Author,Admin}` base, and registered in
`apiRouter`, whatever the caller. That includes React Router loaders and form actions wherever they fetch business data
or change state: the business call goes through a procedure, not through a direct call into a domain operation service.
Route-local machinery — role guards (`requireRole`), install gates, CSRF validation, wire-to-route adaptation such as
`auth/flow-response.ts` — is orchestration on top of the contract, not a bypass. On the HTTP and SSR request surface, a
domain operation service gains no second entry point beside its contract; internal callers — jobs, sibling domains
through the injected seams — keep calling services directly, and that is out of scope here.

Operational and protocol endpoints that happen to answer JSON — `/health`, `/ready`, `/api/rum/status`, the telemetry
intakes — are not application API surface. §3 owns them, and they set no precedent for JSON business operations on Hono.

The callers stay the three of ADR-0009 §4: the browser through `@kobato/web-client`'s assembly over the shared client
factory, the built-in frontend's SSR through `createSsrCaller` against the same `apiRouter` in process, an external
frontend through `createKobatoPublicClient`. ADR-0009 §2 rejected a parallel REST API for external consumers; this ADR
closes the in-repo variant of the same mistake: no ad-hoc Hono JSON command/query routes for application operations
beside `apiRouter`, and no SSR-only schema family beside the contract.

### 2. SSR in-process is a transport optimization, not a policy exception

`createSsrCaller` builds the same `HandlerContext` from the canonical `RequestContext` (ADR-0001) and invokes the same
`apiRouter` with the same interceptors — input validation, and tracing under the `in_process` label instead of `http`.
It skips only the HTTP hop, never any rule.

The React Router request itself still traverses the applicable Hono perimeter middleware before any loader or action
runs: request context derivation, install gate, session, CSRF (the global `csrfGuard` covers every `/rpc/*` call with
the frozen anonymous public-read exemption of ADR-0009 §5; form actions keep their own `validateCsrfForAction`), request
timeout, CSP and security headers, logging. Body limits are mount-scoped, not an RR global — `dynamicBodyLimit` on the
`/rpc` mount, per-resource caps on the resources. There is no in-process fast lane around the middleware above.

The `responseHeaders` adaptation is part of the contract's behavior, kept on both transports: controllers stage
out-of-band headers (session cookies from auth flows, refreshed comment tokens) on `context.responseHeaders`; the
`/rpc/*` mount merges them into the outgoing `Response` (`Set-Cookie` appended, everything else set), and SSR routes
merge them into `redirect`/`data` (`auth/flow-response.ts` for the sign-in and install flows). Cookies travel as real
headers whether the transport was HTTP or in process — never inside the JSON payload.

### 3. Hono resources are justified by transport, protocol, or operational role

A resource is justified when the payload, the protocol, or an operational role — not the application operation — calls
for HTTP machinery the contract tree does not carry. The current registry, by justification:

- **Multipart uploads** (file bodies with per-resource caps): `POST /api/admin/branding/upload`,
  `/api/admin/fonts/upload`, `/api/admin/fonts/package/upload`, `/api/admin/maxmind/upload`,
  `/api/admin/backup/upload-restore`, and the pre-install `/api/setup/restore` (install-state, setup-token, and CSRF
  gates inside the resource).
- **Binary download**: `GET /api/admin/backup/download/:timestamp` — a streamed gzip/octet attachment.
- **Streaming and SSE**: `GET /api/analytics/events` (`text/event-stream`), and the admin music proxy
  (`/admin/music/proxy/cover|audio`) streaming remote provider bytes through the server.
- **External protocols and browser telemetry intake**: `POST /webmention` (the W3C Webmention receive endpoint, an
  external protocol, never an RPC per ADR-0009 §2), the RUM intake relay `POST /api/rum/intake/*` with its
  `GET /api/rum/status` bootstrap, and the device-env beacon `POST /api/analytics/env`.
- **Preserved public URLs serving binary or generated output**: the six feed URLs, `/sitemap.xml`,
  `/manifest.webmanifest`, `/robots.txt`, `/storage/*` (with the S3 storage redirect), `/fonts/embedded/*`,
  `/images/og/*` and the calendar image endpoints, plus the legacy `/tags` and `/search` redirects kept for
  WordPress-compatibility URL preservation.
- **Operational probes**: `/health` and `/ready` on the middleware pipeline itself — infrastructure endpoints outside
  the application API.

The dividing rule: if the operation is a normal application JSON status read or mutation, it is a procedure even when it
accompanies an upload or a stream. The resource owns the bytes or the protocol; the procedure owns the application JSON
around it. Convenience, route symmetry, or "the sibling endpoint is already a resource" are not transport reasons.

### 4. Mixed-surface features are the expected shape

Backup is the reference case: `restoreStatus` and `restoreProgress` are plain procedures on the shared admin
implementer; `uploadRestoreDecrypt` — the JSON completion of a parked encrypted upload — rides its own implementer so
its IP rate limit burns before input parsing, with a dedicated 64 KiB body-limit mount and a 30-minute timeout override
alongside the other restore endpoints. The multipart uploads (`upload-restore`, `setup/restore`) and the binary download
stay resources. Branding mirrors it in one line: `admin.branding.clear` is a procedure, the 2 MiB upload stays a
resource.

So one feature may span both faces, split by payload rather than by feature. This is not a special case to explain away
— it is what correct looks like, and new upload-plus-JSON features should follow the same split instead of dragging
their JSON steps onto the resource face (the mistake `upload-restore/decrypt` made before its migration).

### 5. Adding a surface: criteria and enforcement

- An application JSON command/query follows the standing endpoint recipe (architecture.md "Adding an endpoint"): schema
  in `@kobato/api/contracts`, procedure in `@kobato/api/rpc/<group>`, `implement*` controller, `apiRouter` registration.
  Contract and implementation are kept in step by the existing full-tree parity test
  ([packages/server/tests/unit/server/http/api-contract.test.ts](../../packages/server/tests/unit/server/http/api-contract.test.ts)),
  which fails until every declared procedure is implemented and vice versa.
- A Hono resource requires a justification from §3, stated where the resource is declared. For the `/api` namespace, the
  arch test additionally enforces registration: it scans server and web production code for `/api/...` string literals
  and fails on anything unregistered, so within that scanned surface a new resource path cannot appear without a
  deliberate `RESOURCE_PATHS`/`RESOURCE_PREFIXES` edit in the same change. Resources outside `/api` — `/webmention`, the
  music proxy, `/fonts/embedded/*`, the public document URLs — are outside the scan; they rest on §3 review, not on this
  test. The scan also excludes tests plus two deliberate exemption kinds: the outbound music-provider and observability
  prefixes, whose literals target third-party endpoints, and the RUM client's `rum-url-policy.ts`, which builds the
  registered first-party RUM intake URL by policy instead of as a hand-written resource literal — the intake path itself
  stays pinned in `RESOURCE_PREFIXES`.
- Retired routes stay retired: the four `RETIRED_JSON_ROUTES` paths fail the architecture test wherever they reappear,
  and the `/health` + `/ready` probes stay pinned to the middleware pipeline.
- The two URL surfaces of a procedure — the oc.route `method`/`path` metadata and the `/rpc/*` transport URL derived
  from the tree keys — are defined and pinned in ADR-0009 §3; this ADR adds nothing to that rule and defers to it.

## Rejected alternatives

- **A parallel Hono JSON API for application operations.** A second wire face would duplicate input validation, error
  descriptors, auth gates, rate limits, and tracing that the contract tree already owns once — the exact drift ADR-0009
  §2 rejected for external consumers, one layer closer to home.
- **Calling domain operation services directly from React Router routes.** Skips schema parsing, error translation, rate
  limits, and trace spans; the sign-in/install migration onto `account.auth.*`/`account.setup.*` is the working
  precedent for route flows driving procedures in process.
- **An SSR-only schema family** (loader-output types declared separately from the wire). Two declarations of one
  procedure drift; where SSR output unions exist, they live in the same `@kobato/api/contracts` modules as the wire.
- **Multipart uploads inside oRPC** (base64-in-JSON or file-typed procedure inputs). Whatever shape a framework could
  express, Kobato places uploads on Hono for the machinery the transport side owns outright — explicit per-resource body
  caps, stream staging with progress, parked-upload flows — and keeps bytes out of JSON payloads, where base64 disguises
  them as text and inflates them.
- **Streams and SSE as procedures.** Long-lived responses (event streams, remote-byte proxying) are response-shape
  control Kobato keeps on the transport for framing and stream lifetime — again a placement choice made on transport
  grounds, not a claim about what procedures could or could not express.
- **Exempting the in-process caller from perimeter policy.** One contract with two policy sets is two contracts waiting
  to diverge; the RR request pays the perimeter anyway, so an SSR exemption would guard nothing while inviting a future
  caller to claim it.

## Consequences

- Adding first-party application JSON functionality touches `@kobato/api` and the server controller; the existing
  full-tree parity test keeps contract and implementation in step, with no separate test edits implied. Resources stay
  rare, reviewed additions — within the scanned `/api` surface, their paths are pinned by the arch test in the same
  change. The residual risk is review discipline — a "quick JSON endpoint" on a resource is precisely the failure mode
  the registry and this ADR exist to catch.
- Perimeter policy stays uniform across transports because both faces run through one pipeline; per-route needs are
  declared as explicit, reviewable overrides (the restore 30-minute timeouts, the decrypt 64 KiB body limit) rather than
  silent exemptions.
- Mixed-surface features have a documented reference shape (§4), so "where does the JSON step go" during an
  upload/stream feature is answered by precedent instead of debate.
- Within the `/api` namespace, browser and web code can reference only registered resource paths — the literal scan
  keeps the frontend from quietly growing `fetch('/api/...')` calls to endpoints no contract declares.
- Nothing here changes the public-contract stability semantics of ADR-0009: which procedures carry a guarantee, and how
  the URL surfaces version, remain that ADR's decisions.
