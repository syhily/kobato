# `@kobato/api`

The API SDK: the Zod wire vocabulary (`src/contracts/`), the oRPC procedure metadata (`src/rpc/`) composed from it, the
React-free client transport (`src/client/`), and the built-in frontend's browser assembly (`src/browser/`). An
endpoint's wire schema and procedure metadata are declared here and only here; controllers in `@kobato/server` implement
them through the `implement*` bases in `packages/server/src/http/orpc-base.ts` and own no schema or route metadata of
their own.

## Layout

- `src/contracts/` — per-domain Zod schemas + derived DTOs in three audience layers plus the audience-free root
  `primitives.ts`: `public/` serves the public contract — the anonymous reads plus the viewer interactions promoted out
  of `account` (likes, friends, notifications, newsletter, and the own-comment writes in `comments`) — and `account/`
  the workspace viewer surface, `admin/` the back-office domains.
  - Dependency direction is one-way: the root imports no audience layer, `public/` only itself and the root, `account/`
    may also reach `public/`, and `admin/` may reach `public/` and `account/`. Vocabulary a second audience needs lives
    in the lower layer — never duplicated, never shimmed through re-exports.
  - Root `primitives.ts` holds only generic wire vocabulary with no single domain owner: shared Zod scalars, output
    envelopes, the §8 resource answer unions — the text pair (`resourceOutputSchema`: `ok` with a string body plus
    content type/ETag/cache profile/Content-Language, or `not-modified` with the same representation minus the body),
    the buffered-binary pair the images/branding families answer (`resourceBinaryOkSchema`: `ok` with a `Blob` body and
    an optional ETag, composed with `not-modified`/`redirect` per domain), and the media union the streaming families
    answer (`mediaResourceOutputSchema`: `not-modified` | `redirect` | `range-not-satisfiable` | a bare
    `ReadableStream<Uint8Array>` as `streamOutputSchema`) — plus error descriptors, `zodIssueParams` (the ONE
    issue-params extractor), and `mergePatchInput` / `clearable` / `splitMergePatch` for multi-column field-update
    procedures. `redirect` carries `location` + a nullable `cacheControl`; `range-not-satisfiable` carries the
    representation plus `etag` + `contentRange`.
  - Each wire DTO is declared once as a Zod schema with its TS type derived in the same module (`z.infer`) — no
    hand-written twins. Exceptions: SSR output schemas use `z.custom<T>()` over loader-data types, and `MetaDescriptor`
    arrives as an erased `import type`.
  - PII-heavy admin rows keep their server-side model in `@kobato/server/domains/comments/types.ts`. A UI-only helper
    never lives here, even when pure.
- `src/rpc/` — one module per RPC domain, grouped by audience (`public/`, `account/`, `admin/`) and mirroring the
  contract tree; `rpc/admin/revision.ts` owns the shared revision-contract factory.
  - Procedures are declared only with `defineProcedure({ method, path })` — `define-procedure.ts` is the single
    `oc.route` call site — and compose `src/contracts/` by reference, never a copy. `defineProcedure` brands
    `~orpc.route` with the method/path literals the server's implementation-shape check consumes; a plain `oc.route`
    procedure fails closed and cannot compile into the product tree.
  - Its type parameters are `const`: a factory building paths from a generic base must type that base as
    `` `/${TBase}` `` (`revisionContract<const TBase extends string>(basePath: `/${TBase}`)`); a plain
    `` `/${string}` `` parameter widens every derived path to `` `/${string}/…` ``.
  - `{ publicRead: true }` is the per-procedure anonymous-read declaration: it writes `publicRead: true` onto
    `~orpc.meta` through oRPC's `$meta` chain (never the route record), survives every `.input()`/`.output()` link, and
    is pinned at the type level (`RpcProcedureMeta` vs `NoMeta`). Eligibility is an explicit opt-in, never inferred from
    the HTTP method; `tests/unit/public-read-meta.test.ts` freezes the exact marked key set (twenty-six public reads:
    the seventeen content/interaction reads, the `feeds.*` and `sitemap.xml` document-like resources, and the
    images/branding/fonts/storage binary families; token reads, comment mutations, and the account/admin surface stay
    unmarked). A separate `csrfExempt` meta is frozen to the anonymous device beacon, the backup download, the two
    author music media GETs, and the two inbound protocols (`webmentions.receive`, `observability.rumIntake`) — the
    senders they must keep serving (external Webmention senders, the browser RUM beacon) can never carry the CSRF token;
    it never implies anonymous access and never replaces a role guard.
  - `requestTimeoutMs`, `requestBodyLimit`, `installGateExempt`, and `telemetryExcluded` compose on one procedure, and
    canonical-path derivations share `rpc/metadata.ts`; the server derives its timeout overrides, body caps, and
    install-gate/telemetry policy sets from this metadata instead of parallel path tables.
- Two URL surfaces, never conflated: the **route method/path metadata** is a REST-style compatibility record of deployed
  historical URLs — it must never drift and no REST surface is mounted from it. The **`/rpc/*` transport URLs** derive
  from the ROUTER TREE KEYS (`apiContract.public.content.home` answers at `/rpc/public/content/home`), so tree keys ARE
  RPC transport URLs and the canonical grouped `/rpc/{public,account,admin}/*` paths are the ONLY transport.
- `src/{public,account,admin}-contract.ts` — the per-group composition roots; they compose domain contracts and never
  declare, forward, or re-export procedures. The account group carries only authentication, install, self, passkey, and
  the my-comments reads (`account.comments.loadMine` / `searchMineEntities` / `myCounts` / `resolveEntity`) on the wire
  (`account.auth.*`, `account.setup.*`): the workspace's signin and setup routes drive it FROM THE BROWSER through the
  `orpc` singleton, and `createKobatoPublicClient` exposes none of it. The public site's viewer interactions —
  `public.likes.*`, `public.friends.apply`, `public.notifications.*`, `public.newsletter.*`, and the signed-in
  own-comment writes (`public.comments.updateOwn` / `requestDeleteOwn` / `cancelDeleteOwn`, on the `authedProc` base) —
  were promoted into `publicContract` (ADR-0009 §2); `likes` / `friends.apply` / `newsletter` stay anonymous procedures
  behind the CSRF guard with their own rate limits, `notifications` stays the viewer-session base.
  `public.content.bootstrap.currentUser` carries the viewer's `email` so the admin shell renders it without a second
  call; the session listings (`account.sessions`, `admin.users.listSessions`) carry server-derived `isCurrent` because
  the session cookie is httpOnly. `public.content.bootstrap` carries the public `currentUser` state, the frontend RUM
  bootstrap (null while the gate is inactive), and the install state; it is the one public read that is also
  `installGateExempt`, so the split frontend (`apps/sayaka`) can render both the install gate redirect and the home
  document from it before an admin exists. Its optional `scope` input selects the UI catalog the calling document needs
  — sayaka's public pages default to `public`, kobato's workspace bootstrap (`src/lib/root-bootstrap`) asks for
  `workspace` so the admin SPA receives its full message catalog (and, for a signed-in viewer, the Inkling labels). The
  document-like resources of ADR-0009 §8 live in their own domains: `feeds` (entity plural — the six deployed feed URLs
  collapse into `feeds.rss`/`feeds.atom` with the scope in the input) and `sitemap` (mass noun singular; the `xml` leaf
  makes the tree key `sitemap.xml` mirror the public URL). Their outputs share the `resourceOutputSchema` union from
  root `primitives.ts`; sayaka's resource routes relay it. The two inbound protocols are procedure pairs too:
  `webmentions.receive` (the W3C receive endpoint — permissive `{source,target}` string input, the server's
  `webmentionReceiveSchema` validating inside the handler; the output envelope answers accepted/invalid/disabled so
  sayaka re-emits the exact JSON bodies the old router produced, with unknown-target/queue-full surfacing as decoded
  `ORPCError`s) and `observability.rumIntake` (the OpenObserve intake — input carries the raw track path, raw query,
  body text, and content type; the output envelope is `accepted` or `{status,message,retryAfterSeconds}` so sayaka
  answers the exact 202/4xx/429/502 shapes). Neither is a `publicRead`: both are anonymous mutations behind
  `csrfExempt` + `installGateExempt` (both must answer before an admin exists), and `rumIntake` adds
  `telemetryExcluded` + a 2 MiB `requestBodyLimit` backstop.
- `src/contract.ts` — the composition root (`@kobato/api/contract`): `apiContract = { public, account, admin }`,
  mirroring the server's `apiRouter` nesting exactly. Adding or removing a domain means updating its group root, this
  tree, and the full server parity test.
- `src/client/` — the React-free transport. `createKobatoClient({ url, fetch?, getHeaders? })` returns
  `ContractRouterClient<typeof apiContract>`: `url` is the FULL RPC URL (`https://host/rpc`), never the site origin. The
  factory is ambient-free — no singleton, no CSRF store, no `location`; ambient assembly is the consumer's job
  (`src/browser/` is the built-in frontend's). `createKobatoPublicClient` is the headless public seam — the same
  transport narrowed to `ContractRouterClient<typeof publicContract>`, a type-level guarantee that external consumers
  reach only `/rpc/public/*`.
  `createKobatoServerClient({ url, request, clientAddress?, analyticsEventId?, requestTimeoutMs?, fetch? })` is the
  request-scoped, ambient-free server assembly: it returns `{ client, responseHeaders }`, forwards only an allowlisted
  header set from the inbound `Request` (`cookie`, `user-agent`, `accept-language`, `referer`, `purpose`, `sec-purpose`,
  `traceparent`, `tracestate`, `sec-ch-ua` and every `sec-ch-ua-*` — never `x-csrf-token`, `host`, or the inbound
  `cf-connecting-ip` / `x-real-ip` / `x-forwarded-for`), sends `X-Forwarded-For` only from the caller-derived
  `clientAddress`, composes the fetch abort signal from the inbound `request.signal` and the per-call client-options
  signal (`AbortSignal.any` when both exist, the single present signal unchanged otherwise), bounds it with a response
  timeout from `client/request-timeout.ts` — the `requestTimeoutMs` option or `DEFAULT_REQUEST_TIMEOUT_MS` (30 s) aborts
  the fetch while kobato has not answered; a procedure's declared `requestTimeoutMs` metadata wins when it is larger
  (the 30-minute restore/install procedures are never cut); the timeout is released once kobato's headers arrive, so
  streamed bodies and captured resource streams are never cut mid-flight while an inbound/per-call abort still cuts them
  at any point (`requestTimeoutMsForUrl` over the same metadata table is the shared seam for sayaka's forwarder) — and
  accumulates every `Set-Cookie` from every response into `responseHeaders` in order. The optional `analyticsEventId` is
  sent on every call as `X-Kobato-Analytics-Event` — the constant `ANALYTICS_EVENT_HEADER` lives in
  `client/analytics-event.ts` and is shared with the server, whose `extractRequestFacts` adopts the inbound id when it
  is a syntactically valid UUID and otherwise mints one (the split frontend mints it per document request so the
  server-side page view and the browser beacon share one join key). `error.ts` decodes wire payloads:
  `extractApiErrorMessage` and `apiErrorDescriptorKey` read the ERROR payload, while `isApiAccepted` is a
  RESPONSE-payload guard — keep the two sides distinct. `rpc-serialization.ts` owns RPC input/query/multipart encoding
  and response/error decoding for `sendBeacon` and the backup progress XHR; `rum-intake.ts` owns the external
  OpenObserve intake proxy URL. `resource-stream.ts` owns the streaming-resource transport seam shared with the server:
  `RESOURCE_STREAM_HEADER` (`x-kobato-resource-stream`) marks an RPC response whose body is the raw byte stream of a
  `fonts.embedded`/ `storage.object` answer, its value being the browser-facing status (200/206).
  `createKobatoServerClient` captures such responses per procedure path — the fetch override records
  `{ status, headers (minus Set-Cookie, `content-encoding`, `content-length`, and the marker), body }` and answers the
  oRPC call with a JSON stub so the RPCLink never buffers the bytes — and exposes the capture through
  `takeResourceStream(procedure)` (take-once; a second answer for the same procedure cancels the previous body). This is
  the ONLY buffered-free path: the standard RPCLink decode buffers every non-event-stream body, and a `ReadableStream`
  nested inside an envelope object is silently dropped by the JSON serializer — pinned by
  `tests/unit/client/create-server-client.test.ts`. `client-address.ts` is the visitor-address derivation both
  perimeters share — a pure function over the web `Request` (loopback/trusted-proxy-gated proxy-header resolution), with
  the IP/CIDR grammar from `@kobato/auth/trusted-proxy`. `is-bot.ts` is the User-Agent bot heuristic shared by the
  analytics domains and sayaka's entry server (moved here from `@kobato/server` so the public app consumes it without
  crossing the server boundary).
- `src/browser/` — the built-in frontend's browser assembly, and the ONLY UI-bound, ambient part of the package:
  `client.ts` is the browser singleton (`orpc` + `setCsrfToken` — the CSRF token store and the same-origin `/rpc` URL
  default, delegating to `createKobatoClient`), `orpc-query.ts` the TanStack Query binding (`orpcQuery`),
  `query-client.ts` the app's `QueryClient` factory (`makeQueryClient`), and `use-notifications.ts` the contract's data
  hooks (`useUnreadNotificationCount`, `useInvalidateNotifications`, `usePatchNotificationReadState` over
  `patchNotificationReadState` — the TanStack Query reads of `public.notifications.*` with the read-state cache patching
  beside them, ADR-0011 §3). It is a leaf: nothing else under `src/` imports it, and neither does `@kobato/server`,
  `@kobato/db`, or a shared leaf.

## Rules

- Allowed deps: `@orpc/contract` (rpc + client), `@orpc/client` (client only), and the shared leaves `auth`, `catalog`,
  `settings`, `i18n`, `utils`, inkling `/headless`, `assets`; `src/browser/` additionally imports `@orpc/react-query`,
  `@tanstack/react-query`, and `react` (`use-notifications`' `useCallback`), and its one shared-leaf import is
  `@kobato/utils/type-guards` (`use-notifications`' `isRecord`). `@types/react` is declared only to pin
  `@orpc/react-query`'s and `@tanstack/react-query`'s peer resolution to the workspace's single React copy, and `react`
  is that pin plus a runtime import of `use-notifications` — `src/browser/` is the one tree that imports `react`, and no
  module outside it does. `src/contracts/` imports no `@orpc/*` package and never imports `src/rpc/` or `src/client/`
  (`apps/kobato/tests/arch/shared-react-free.test.ts`).
- A browser hook imports the contract, the client, and TanStack Query — never a UI package (`@kobato/ui`,
  `@kobato/web-kit`, and `@kobato/inkling` — the barrel and every entry but `/headless*`), never message copy (the
  `@kobato/i18n` message catalogs `messages/*`, the fallback catalog `fallback-messages`, and the label tables
  `inkling-labels/*`), never a consumer's route data (React Router); `toast-api-error` (sonner, message ids) and the
  document clock fail it and stay out (ADR-0011 §3, `apps/kobato/tests/arch/shared-react-free.test.ts` — its tripwire
  proves every entry of the ban list, type-only imports included).
- Runtime-isomorphic and React-free outside `src/browser/`: no node/DOM-only APIs, no logger. The contract, rpc, and
  client layers use only the isomorphic web platform — never browser-only globals or ambient mutable state;
  `globalThis.fetch` is only the default fetch adapter. `src/browser/` is the one exemption and never grows a second
  (`apps/kobato/tests/arch/shared-react-free.test.ts`).
- No barrel `index.ts`, no `export { X } from 'y'` re-exports; consumers import `@kobato/api/<module>.ts`.
- Auth, CSRF, rate limits, tracing, and the `HandlerContext` stay server-side: a contract carries only transport-visible
  metadata, never behavior.
- Tests: `tests/unit/` (`api-unit`, defined with its `api-iso-unit` twin in `@kobato/test/projects/api-projects.ts`)
  pins contract shapes (key sets, route method/path values, schema identity against the contracts, parse behavior, per
  group), the `defineProcedure` factory (`define-procedure.test.ts`), and the frozen `publicRead` key set;
  `tests/unit/client/` pins the transport factory, the real-transport public seam (`public-client.test.ts`), and wire
  error decoding; `tests/unit/browser/` pins the browser singleton assembly and the notifications data hook's read-state
  cache patch (`use-notifications.test.ts`, a real `QueryClient` — mock-free, so it runs in `api-unit`, not the `-iso-`
  twin). The server-side full-tree parity test and `apps/kobato/tests/arch/public-api-contract.test.ts` pin the
  surfaces. `tests/utils/catalog.ts` is the workspace-canonical content and DTO fixture; `tests/utils/notifications.ts`
  is the workspace-canonical notification cache fixture (the row factory and the tab seed/read helpers that
  `use-notifications.test.ts` and the kit's drawer read-state test share).
