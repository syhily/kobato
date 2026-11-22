# ADR-0009: Optional headless frontends over the public contract

- Status: accepted
- Date: 2026-11-22
- Related: [ADR-0001](0001-request-and-process-state.md), the consumer guide
  ([../manual/Headless.md](../manual/Headless.md))

## Context

Kobato ships as one process and one SEA binary: built-in public site, admin/editor/auth SPA, oRPC APIs, resources,
analytics. The product goal: an independently deployed frontend can render the public site against the same backend —
without the backend executing frontend code, without duplicating business logic, and without maintaining a second wire
surface beside the first.

The architecture already provides the seams:

- `@kobato/api` is contract-first: every procedure's `method`/`path`/`input`/`output` is declared once in the contract
  tree; the server implements through the `implement{Public,Authed,Author,Admin}` bases under a full-tree parity test,
  and the browser client is typed exclusively through `apiContract`.
- `@kobato/api` owns the wire Zod schemas (in its `contracts/` layer) and the contract tree; `@kobato/catalog` owns the
  public content read model and projections; `@kobato/inkling` publishes its document model React-free under
  `/headless`.
- The web family splits along the same boundary — `@kobato/web-public` renders the public site and never imports the
  server — and public SSR consumes the same `apiRouter` in process through `createSsrCaller`.

This ADR settles what those seams do not yet state: which procedures carry a stability guarantee for external consumers,
how compatibility is versioned, and which deployment topologies are supported.

## Decision

### 1. Headless is a consumption mode, not a delivery form

The delivery form is unchanged: one process, one SEA binary, built-in public site, admin/editor/auth SPA, resources,
analytics (ADR-0001). "Headless" means an externally deployed frontend renders the public site by calling the backend's
public procedures over HTTP — nothing more. There is no runtime switch, no separate build target, and no `headless`
settings section: public procedures are always mounted, and an external frontend is simply another caller.

### 2. The public contract is the `public` subtree of `apiContract` — no second API

The headless wire surface is the existing oRPC contract tree mounted at `/rpc/*`, not a parallel REST API. It is
`publicContract` — the `public` group root of `apiContract`, composed in `@kobato/api/public-contract.ts` — whose seven
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
consumer.

### 3. Two URL surfaces; canonical grouped transport URLs, with a legacy alias adapter

The oc.route `method`/`path` metadata declared in `@kobato/api` is one surface: the REST-style wire compatibility
contract, unchanged by this ADR — its values must never drift from deployed URLs. The `/rpc/*` transport URLs are a
second surface, derived by oRPC's `RPCHandler`/client from the ROUTER TREE KEYS: grouping the tree into
`public`/`account`/`admin` moved the transport paths (`apiContract.public.content.home` answers at
`/rpc/public/content/home`), while the oc.route metadata kept its historical values.

The grouped paths are canonical: every in-repo caller and every new headless client uses them. Because regrouping would
otherwise break already-deployed clients, the server runs every `/rpc/*` request through a legacy request-path adapter
first (`packages/server/src/http/request/legacy-rpc-path.ts`), rewriting the 49 pre-grouping URLs —
`/rpc/{content,avatar,github,images,music,webmentions}/*` to `public`,
`/rpc/{likes,friends,newsletter,notifications,passkey}/*` and the seven authed `/rpc/comments/*` procedures to
`account`, `/rpc/analytics/*` to `/rpc/admin/analytics/*`, and the six public `/rpc/comments/*` procedures to `public` —
onto the canonical grouped paths before the handler, preserving method, headers, body, and query. The adapter is a
compatibility alias only; it carries no stability promise for new consumers, and `account` self keys (`/rpc/account/*`)
never moved.

### 4. One contract, three callers

- The browser calls `/rpc/*` same-origin through `@kobato/web-client`'s full-tree `ContractRouterClient` (the grouped
  `apiContract`, including the workspace surfaces the built-in SPA needs).
- The built-in frontend's SSR calls the same `apiRouter` in process through `createSsrCaller` — a performance seam, not
  a privilege: identical contract, inputs, outputs, and errors, with no HTTP hop. That includes the auth routes: the
  React Router signin/setup loaders and form actions drive `account.auth.*`, `account.setup.*`, and
  `account.passkey.authBegin`/`authFinish` over the same in-process router, with the install gate and the global CSRF
  guard applying first and `flow-response` doing only wire-to-route adaptation (response union + `Set-Cookie` headers) —
  there is no second authentication interface beside the contract, and none of these procedures joins the headless
  public seam.
- An external frontend calls `/rpc/*` from its server through `createKobatoPublicClient` — the headless public seam
  exported by `@kobato/api/client/create-client.ts`. It is the same transport factory as `createKobatoClient` (same
  options, same RPCLink; `url` is the full RPC URL `https://host/rpc`) narrowed to `publicContract`, so external
  consumers call `client.content.*` / `client.comments.*` against the canonical `/rpc/public/*` paths and no
  `account`/`admin` surface is reachable from the returned client — a type-level guarantee. No consumer assembles an
  oRPC link by hand; the factory keeps every caller on the same transport as the built-in browser client, and the
  public-contract stability semantics of §2 are unchanged by which transport invokes them.

No SDK packages ship to npm. Consumers consume the workspace source — publishing packages is a separate decision, taken
only when a consumer that cannot live inside the workspace actually exists.

### 5. Semantics are preserved, not redesigned

The public contract keeps exactly its current semantics: the Live gate (draft, scheduled, unpublished, and soft-deleted
content invisible), `visible` orthogonality, ETag fingerprinting with `not-modified`/`redirect` signal unions, a page
view recorded for a served document, comment-token cookies, and the stateless `__csrf` double-submit — which guards
every `/rpc/*` call except a frozen set of anonymous public-read procedures: the sixteen exact canonical paths (all nine
`content.*` reads plus `comments.loadComments`, `webmentions.list`, `avatar.find`, `github.avatar`, `github.release`,
`images.resolveThumbhash`, `music.get`) hand-listed in `packages/server/src/http/request/public-read-rpc-path.ts`,
legacy aliases included. The exemption is deliberately procedure-scoped — the RPC transport POSTs reads too, so it can
never be an HTTP-method rule, and it is never derived from route metadata, so a future sensitive read cannot gain it by
accident. The comment-token reads (`getRaw`/`myComments`), every mutation, and the whole `account`/`admin` surface keep
the full guard; a headless consumer therefore reads bare while interactive comment flows remain same-origin cookie +
CSRF. An external frontend is another caller of those procedures, not a reason to re-legislate caching, analytics, or
read isolation: a served document counts a page view no matter who rendered it.

Framework coupling already present in the wire is accepted: listing DTOs carry `seo: MetaDescriptor[]` (React Router
meta descriptors). Consumers not on React Router map them; neutralizing the SEO projection is neither required nor
planned.

### 6. Deployment topology

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
`SameSite=Lax` and stay on the Kobato origin), and the §5 CSRF exemption covers exactly the anonymous public-read
procedures — so a foreign origin's browser reads the public contract with `security.cors` alone (never turn
`security.csrf` off for this), while a server-side consumer (CORS-immune) is an equally supported cross-origin caller.
Full interactive parity means a same-origin deployment.

### 7. Scope boundaries

- Draft preview (`?draft=true`, session-gated, per-entity author rules) stays a built-in-frontend capability; external
  frontends render Live content only. If an external preview need materializes, it gets its own ADR.
- Admin, editor, and authentication screens remain Kobato's own at `/admin/*` and `/editor/*`; an external frontend
  never reimplements them, and WebAuthn keeps binding to `siteIdentity.website`.
- The stability boundary is the wire, not the components. An external frontend may reuse `@kobato/web-public` and the
  other workspace packages, but only the public contract groups carry the compatibility guarantee.
- Feeds, sitemap, storage, fonts, images, OG, the RUM relay, and analytics intakes stay Kobato-owned HTTP resources; an
  external frontend links to them or calls them as documented endpoints, and never re-hosts them.

### 8. Delivery status

Everything this ADR required has shipped; nothing else was needed:

- the arch test pinning the public contract —
  [apps/kobato/tests/arch/public-api-contract.test.ts](../../apps/kobato/tests/arch/public-api-contract.test.ts);
- the headless client factory `createKobatoPublicClient` in
  [packages/api/src/client/create-client.ts](../../packages/api/src/client/create-client.ts), with its transport pins
  under `packages/api/tests/unit/client/`;
- the legacy `/rpc/*` alias adapter in
  [packages/server/src/http/request/legacy-rpc-path.ts](../../packages/server/src/http/request/legacy-rpc-path.ts);
- the integration guide: [../manual/Headless.md](../manual/Headless.md).

No new packages, no settings sections, no data migration, no release coupling. Nothing has been published to npm and no
external frontend adoption is claimed — the workspace packages are consumed as source, and the first real consumer will
tell whether publishing becomes its own decision.

### Rejected alternatives

- **Headless-only delivery with a migration program.** The built-in site is the reference consumer and the rollback
  target; removing it buys nothing once the contract is shared.
- **A parallel versioned REST content API with OpenAPI.** A second wire surface kept eternally in agreement with the
  contract tree, which is already the single source for browser, SSR, and server.
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

- Headless support landed as one arch test, one client factory, one alias adapter, and documentation instead of a
  migration program; the residual risk is discipline — public-contract changes must stay additive until a Kobato major
  says otherwise.
- External consumers get a typed, schema-first wire for free, and accept its document-oriented semantics — page views on
  reads, React Router-shaped SEO — rather than a neutralized data API.
- Cross-origin deployment is read-only by policy; interactive external frontends deploy same-origin behind a proxy. That
  is scope control, not a limitation scheduled to be fixed.
- The built-in public frontend remains the parity reference, so public behavior stays testable in one place regardless
  of how many external frontends exist.
- npm publishing and framework-neutral SEO, if ever genuinely required, arrive as their own decisions on top of this
  boundary.
