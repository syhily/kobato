# ADR-0009: Optional headless frontends over the public contract

- Status: proposed
- Date: 2026-11-22
- Related: [ADR-0001](0001-request-and-process-state.md)

## Context

Kobato ships as one process and one SEA binary: built-in public site, admin/editor/auth SPA, oRPC APIs, resources,
analytics. The product goal: an independently deployed frontend can render the public site against the same backend —
without the backend executing frontend code, without duplicating business logic, and without maintaining a second wire
surface beside the first.

The architecture already provides the seams:

- `@kobato/api` is contract-first: every procedure's `method`/`path`/`input`/`output` is declared once in the contract
  tree; the server implements through the `implement{Public,Authed,Author,Admin}` bases under a full-tree parity test,
  and the browser client is typed exclusively through `apiContract`.
- `@kobato/contracts` owns the wire Zod schemas; `@kobato/catalog` owns the public content read model and projections;
  `@kobato/inkling` publishes its document model React-free under `/headless`.
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

### 2. The public contract is the public groups of `apiContract` — no second API

The headless wire surface is the existing oRPC contract tree mounted at `/rpc/*`, not a parallel REST API. A procedure
belongs to the **public contract** when the public document surface consumes it for content rendering or visitor
interactions and it is callable by anonymous or viewer-credentialed callers. That is the `content`, `comments`, `likes`,
`notifications`, `friends`, `webmentions`, `avatar`, and `newsletter` groups.

Everything else is **workspace surface**, free to churn with any release: the `admin.*` subtree, `account` and `passkey`
(the shipped SPA's own auth), and the mounted-but-unguaranteed helpers of the built-in renderer (`music`, `images`,
`github`). An arch test pins the public group and procedure list — additions and removals to the guaranteed set become
deliberate acts reviewed against this ADR.

Compatibility rides the repository version. Every workspace package carries the same version as the backend
(`pnpm version:sync`); an external consumer pins the packages matching its backend, additive changes to public
procedures are ordinary minor hygiene, and a breaking change to the public contract requires a Kobato major. There is no
runtime version or capability negotiation: static typing through the contract tree replaces it for every supported
consumer.

### 3. One contract, three callers

- The browser calls `/rpc/*` same-origin through `@kobato/web-client`'s `ContractRouterClient`.
- The built-in frontend's SSR calls the same `apiRouter` in process through `createSsrCaller` — a performance seam, not
  a privilege: identical contract, inputs, outputs, and errors, with no HTTP hop.
- An external frontend calls `/rpc/*` from its server through an oRPC HTTP client typed by the same `@kobato/api`
  contract tree, and depends on the workspace packages (`@kobato/api`, `@kobato/contracts`, the shared leaves).

No SDK packages ship to npm. Consumers consume the workspace source — publishing packages is a separate decision, taken
only when a consumer that cannot live inside the workspace actually exists.

### 4. Semantics are preserved, not redesigned

The public contract keeps exactly its current semantics: the Live gate (draft, scheduled, unpublished, and soft-deleted
content invisible), `visible` orthogonality, ETag fingerprinting with `not-modified`/`redirect` signal unions, a page
view recorded for a served document, comment-token cookies, and the stateless `__csrf` double-submit. An external
frontend is another caller of those procedures, not a reason to re-legislate caching, analytics, or read isolation: a
served document counts a page view no matter who rendered it.

Framework coupling already present in the wire is accepted: listing DTOs carry `seo: MetaDescriptor[]` (React Router
meta descriptors). Consumers not on React Router map them; neutralizing the SEO projection is neither required nor
planned.

### 5. Deployment topology

The default is unchanged: one origin, the built-in site; `siteIdentity.website` remains the canonical origin, and public
URLs, feeds, image endpoints, and WordPress-compatibility routes are preserved as they are.

**Same-origin interactive deployment.** An external frontend acts as the public entry and forwards the Kobato-owned
paths (`/rpc/*`, `/admin/*` and `/editor/*` including the auth screens, `/storage/*`, `/fonts/*`, `/images/*`, `/api/*`
intakes, feeds, sitemap) to the backend. No forwarding middleware ships with Kobato; the integration guide carries a
reference reverse-proxy table. All credentialed interactions — comments, like tokens, viewer notifications,
admin-in-public operations — stay same-origin in this topology, so cookie, CSRF, and WebAuthn semantics are untouched.

**Cross-origin read-only deployment.** The existing `security.cors` allowlist (`{ enabled, origins }`, exact origins) is
the single switch for letting another origin perform anonymous public reads from the browser. Cross-origin credentialed
calls are out of scope by policy; full interactive parity means a same-origin deployment.

### 6. Scope boundaries

- Draft preview (`?draft=true`, session-gated, per-entity author rules) stays a built-in-frontend capability; external
  frontends render Live content only. If an external preview need materializes, it gets its own ADR.
- Admin, editor, and authentication screens remain Kobato's own at `/admin/*` and `/editor/*`; an external frontend
  never reimplements them, and WebAuthn keeps binding to `siteIdentity.website`.
- The stability boundary is the wire, not the components. An external frontend may reuse `@kobato/web-public` and the
  other workspace packages, but only the public contract groups carry the compatibility guarantee.
- Feeds, sitemap, storage, fonts, images, OG, the RUM relay, and analytics intakes stay Kobato-owned HTTP resources; an
  external frontend links to them or calls them as documented endpoints, and never re-hosts them.

### 7. What remains to ship

Enabling headless consumption stays deliberately small:

- an arch test pinning the public contract — the guaranteed group and procedure list with methods and paths;
- an integration guide under `docs/manual/`: consuming `@kobato/api` from a server runtime, the same-origin reference
  proxy table, the `security.cors` read-only setup, and the Live/`visible`/ETag semantics a consumer must honor;
- nothing else. No new packages, no settings sections, no data migration, no release coupling.

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

- Headless support costs one arch test and documentation instead of a migration program; the residual risk is discipline
  — public-contract changes must stay additive until a Kobato major says otherwise.
- External consumers get a typed, schema-first wire for free, and accept its document-oriented semantics — page views on
  reads, React Router-shaped SEO — rather than a neutralized data API.
- Cross-origin deployment is read-only by policy; interactive external frontends deploy same-origin behind a proxy. That
  is scope control, not a limitation scheduled to be fixed.
- The built-in public frontend remains the parity reference, so public behavior stays testable in one place regardless
  of how many external frontends exist.
- npm publishing and framework-neutral SEO, if ever genuinely required, arrive as their own decisions on top of this
  boundary.
