# Workspace architecture

This page is the one-page map of the Kobato workspace: what every package is responsible for, which way the dependencies
point, and how the pieces fit together when you add an endpoint. It describes the current state — the authoritative
per-package contracts live in each package's `AGENTS.md`, and the graph itself is pinned by
[apps/kobato/tests/arch/package-dag.test.ts](../apps/kobato/tests/arch/package-dag.test.ts).

For the external-consumer story (which RPC groups carry a stability guarantee, deployment topologies), see
[ADR-0009](adr/0009-optional-headless-frontends.md).

## The dependency graph

Four top-level roots, one direction of flow: `apps/` deploy the product, `packages/` hold all shipping code, `tools/`
and `scripts/` are dev support only.

```mermaid
flowchart TD
  subgraph APPS["apps/ — deployables"]
    APP["kobato — React Router 8 app (SSR)"]
    DEMO["inkling-demo — editor playground"]
  end

  subgraph WEB["packages/web/ — browser frontends"]
    ADMIN["web-admin — admin SPA"]
    PUBLIC["web-public — public site"]
    CLIENT["web-client — browser platform"]
  end

  SERVER["server — backend domains, HTTP, SSR"]
  DB["db — SQLite + DuckDB persistence"]
  API["api — API SDK"]
  UI["ui — design system"]
  INKLING["inkling — editor"]

  subgraph SHARED["packages/shared/ — nine React-free leaves"]
    UTILS["utils"]
    I18N["i18n"]
    AUTH["auth"]
    CACHE["cache"]
    CATALOG["catalog"]
    DIST["distribution"]
    SETTINGS["settings"]
    ASSETS["assets"]
    SANITIZE["sanitize"]
  end

  APP --> SERVER
  APP --> WEB
  APP --> API
  APP --> UI
  APP --> INKLING
  APP --> SHARED

  DEMO --> INKLING
  DEMO --> PUBLIC
  DEMO --> UI

  ADMIN --> PUBLIC
  ADMIN --> CLIENT
  PUBLIC --> CLIENT
  WEB --> UI
  WEB --> API
  WEB --> INKLING
  WEB --> SHARED

  SERVER --> API
  SERVER --> DB
  SERVER --> INKLING
  SERVER --> SHARED

  DB --> INKLING
  DB --> SHARED

  API --> INKLING
  API --> SHARED

  UI --> SHARED

  INKLING --> UI
  INKLING --> SANITIZE
  INKLING --> ASSETS
  INKLING --> UTILS

  CATALOG -.->|"type-only, headless"| INKLING

  UTILS --> I18N
  AUTH --> I18N
  CACHE --> I18N
  CACHE --> UTILS
  SETTINGS --> I18N
  SETTINGS --> CACHE
  SETTINGS --> ASSETS
  SETTINGS --> UTILS
  CATALOG --> SETTINGS
  CATALOG --> I18N
  CATALOG --> UTILS
```

How to read it:

- Every arrow is also the enforcement: the declared-allowlist, the per-file import scan, and the web direction are all
  pinned in `apps/kobato/tests/arch/` (`package-dag`, `web-direction`, `server-layers`, `admin-feature-graph`,
  `server-public-surface`, `module-cycles`).
- An edge into the shared umbrella means "depends on the leaves it declares" — each package declares exactly the leaves
  it imports, never the whole set. `@kobato/i18n`, `@kobato/distribution`, `@kobato/assets`, and `@kobato/sanitize` have
  no leaf dependencies of their own.
- Inkling is reached through its entry surfaces only: `server`, `db`, and `api` import the React-free `/headless*`
  modules; `catalog` imports them type-only; `web-admin` uses the headless modules, the React barrel, and `/host-cards`;
  `web-public` uses the headless modules and the React barrel; `web-client` uses the barrel. The app imports no Inkling
  TypeScript module — its editor surfaces come from the web leaves — but its style entries
  (`apps/kobato/src/styles/{public,admin}.css`) compose `@kobato/inkling/styles/cards.css`. The playground uses the
  public entries.
- `web-admin` declares `@kobato/server` as a tests-only fixture dependency — its production sources never import the
  server.

Key external libraries and their primary production homes. The table states ownership, not an exhaustive import
inventory — test trees, build-config strings, and erased type-only references sit outside it; actual imports stay
constrained by the package DAG:

| Library                                             | Home                                                                                                                                                                                                                                           |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zod                                                 | Ubiquitous; the wire vocabulary lives in `@kobato/api/contracts`                                                                                                                                                                               |
| `@orpc/contract`                                    | `@kobato/api` — procedure metadata in `rpc/`, the client transport in `client/`; `src/contracts/` imports no `@orpc/*`                                                                                                                         |
| `@orpc/server`                                      | `@kobato/server` — the `implement{Public,Authed,Author,Admin}` bases and router mounting in `http/`                                                                                                                                            |
| `@orpc/client`                                      | `@kobato/api/client` — the production link assembly every caller shares (the factory)                                                                                                                                                          |
| `@orpc/react-query`                                 | `@kobato/web-client` — the React Query seam; the SDK stays React-free                                                                                                                                                                          |
| Hono                                                | `@kobato/server` — the HTTP perimeter                                                                                                                                                                                                          |
| React Router 8                                      | The app's routes and `meta` export; runtime use across the web leaves (`Link`, hooks) and the server's SSR perimeter (`createSsrCaller`); its `MetaDescriptor` type shapes catalog's SEO/listing models and through them the listing wire DTOs |
| Lexical                                             | `@kobato/inkling` — the editor owns the Lexical runtime; consumers reach it through inkling's entry surfaces                                                                                                                                   |
| Drizzle + `node:sqlite`                             | `@kobato/db` — content DB schema, rows, migrations                                                                                                                                                                                             |
| DuckDB (`@duckdb/node-api`) + Kysely (compile-only) | The engine handle and dashboard queries in `@kobato/db`; Kysely is the compile-only SQL builder for analytics queries (db and the server's analytics services, executed through the db seam)                                                   |

## Package responsibilities

Product packages (`apps/` + `packages/`) — every one has a package-root `AGENTS.md` with the full contract:

| Package              | Responsibility                                                                                                                                                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/kobato`        | The deployable React Router 8 Framework Mode app (SSR): framework entry set, the four route trees, the typed route-meta/SEO factory. Routes extract request context, call orchestrators, render — the app owns nothing reusable.                                                                                                |
| `apps/inkling-demo`  | Standalone Inkling playground (`pnpm demo`); not part of the product build.                                                                                                                                                                                                                                                     |
| `@kobato/api`        | The API SDK — wire Zod schemas + DTOs (`contracts/`), oRPC procedure metadata grouped by audience (`rpc/{public,account,admin}/`), the three group composition roots + `contract.ts`, and the React-free client factories (`createKobatoClient` and the headless `createKobatoPublicClient`) + wire-error decoding (`client/`). |
| `@kobato/server`     | The backend — six one-way source roots (`bootstrap/`, `infra/`, `domains/`, `http/`, `render/`, `assets/`): business domains, the oRPC + Hono perimeter, SSR output products (HTML, feeds, OG, SEO), sessions, jobs, backup.                                                                                                    |
| `@kobato/db`         | Persistence — the SQLite content database (node:sqlite + Drizzle: schema, row types, queries, migrations) and the DuckDB analytics sidecar's persistence layer (DDL, appends, dashboard queries).                                                                                                                               |
| `@kobato/ui`         | The design system — tokens, base styles, shadcn/Base UI primitives, icons, theme/i18n providers, generic presentation hooks, the music-player family.                                                                                                                                                                           |
| `@kobato/inkling`    | The Lexical rich-text editor — React runtime and host cards; the document model ships React-free under `/headless`.                                                                                                                                                                                                             |
| `@kobato/web-admin`  | The admin frontend leaf — admin components, domain controllers, the page-editor composition.                                                                                                                                                                                                                                    |
| `@kobato/web-public` | The public frontend leaf — public chrome, the comment thread, post-body projection and hydration, widgets, the friends grid.                                                                                                                                                                                                    |
| `@kobato/web-client` | The browser platform under both leaves — document-level hooks, the oRPC browser client assembly (same-origin URL, CSRF store), root settings contexts, React Query wrappers, the cross-surface editor platform, the RUM client.                                                                                                 |

The nine shared leaves (`packages/shared/`) — runtime-isomorphic and React-free, imported module-direct with no barrels:

| Leaf                   | Responsibility                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@kobato/utils`        | Pure isomorphic helpers + display formatting.                                                                                                                             |
| `@kobato/i18n`         | Locale contract, ICU message catalogs, translator scopes.                                                                                                                 |
| `@kobato/auth`         | Role vocabulary, password/Web Crypto primitives, network SSRF/CIDR and passkey RP checks.                                                                                 |
| `@kobato/cache`        | Bucket declaration registry — never a storage plane.                                                                                                                      |
| `@kobato/catalog`      | Public content read model + projections, plus the `seo/` presentation-metadata layer.                                                                                     |
| `@kobato/distribution` | Build identity (`__APP_*__`), SEA asset keys, route-warmup manifest contract.                                                                                             |
| `@kobato/settings`     | Section schema/default/secret registry, admin projections, snapshot slot, representation scopes, RUM client identity, plus the `telemetry/` observability protocol layer. |
| `@kobato/assets`       | Asset-URL grammar, image kinds, avatar rule, Gravatar mirror, code-block highlight languages.                                                                             |
| `@kobato/sanitize`     | Isomorphic DOMPurify stack, `sanitize-url`, `escape-html`.                                                                                                                |

Tools packages (`tools/`) support development only — nothing under `tools/` ships in the product binary, and no product
`src/` module imports a tools package (arch-pinned; product _tests_ import `@kobato/test` / `@kobato/harness` freely):

| Tool              | Responsibility                                                                       |
| ----------------- | ------------------------------------------------------------------------------------ |
| `tools/toolchain` | The shared tsconfig + the single workspace path table; build-time Vite plugins.      |
| `tools/test`      | In-process Vitest fixtures, shared setup, and the multi-package project definitions. |
| `tools/harness`   | The out-of-process instance harness (SMTP capture, live instances).                  |
| `tools/browser`   | The real-browser Playwright journey runner (`test:browser` / `sea:browser`).         |
| `tools/email`     | Localized email-template previews (`emails:generate`).                               |
| `tools/i18n`      | Regional terminology diff report (`i18n:regional-diff`).                             |
| `tools/trace`     | OpenObserve DEV container tooling (`trace:up` / `trace:smoke`).                      |
| `tools/pack`      | The SEA pipeline, release automation, version sync, shared vite config helpers.      |

## The API SDK (`@kobato/api`)

One package owns the wire surface end to end:

```text
packages/api/src/
  contracts/          # wire vocabulary — per-domain Zod schemas + derived DTOs, api-error, merge-patch, primitives
  rpc/public/         # anonymous consumers — content, comments, webmentions, avatar, github, images, music
  rpc/account/        # the viewer — self, auth (sign-in), setup (install), comments (authed), notifications, passkey,
                      # likes, friends, newsletter
  rpc/admin/          # every admin surface on /admin/<domain>/…, plus analytics (legacy /analytics/* oc.route paths)
  public-contract.ts  # the public group composition root — publicContract
  account-contract.ts # the account group composition root — accountContract (accountSelfContract spread at its root)
  admin-contract.ts   # the admin group composition root — adminContract
  contract.ts         # composition root (@kobato/api/contract): apiContract = { public, account, admin }
  client/             # createKobatoClient + createKobatoPublicClient factories, wire error decoding
```

- `contracts/` declares every wire schema once; `rpc/` composes those schemas **by reference, never a copy** — an
  endpoint's `method`/`path`/`input`/`output` is declared here and only here. The three group roots
  (`public-contract.ts` / `account-contract.ts` / `admin-contract.ts`) compose the domain contracts of their audience;
  `contract.ts` composes exactly those three roots into the tree, mirroring the server `apiRouter` nesting
  (`apiRouter.public.content.home` ⇔ `apiContract.public.content.home`). None of the composition roots declares,
  forwards, or re-exports a procedure; adding or removing a domain means updating its group root, this tree, and the
  full server parity test.
- **The three groups** split the same procedures by audience: `public` is the anonymous/headless surface (`content`,
  `comments` — the public thread plus the comment-token procedures, `webmentions`, `avatar`, `github`, `images`,
  `music`); `account` is the viewer's surface (`accountSelfContract` spread at the root plus the sign-in ceremony
  `auth`, the install flow `setup`, authed `comments`, `notifications`, `passkey`, `likes`, `friends`, `newsletter` —
  several of those, the sign-in/install ceremonies included, are anonymous flows with their own guards and rate limits;
  moving them into `account` regroups tree keys by audience, it changes no guard); `admin` is every admin domain plus
  `analytics`, whose oc.route paths stay the legacy `/analytics/*`.
- **Two URL surfaces, never conflated.** The _oc.route method/path metadata_ declared in `rpc/` is the REST-style wire
  compatibility contract — its values are deployed URLs and must never drift. The _`/rpc/*` transport URLs_ are derived
  by oRPC's `RPCHandler`/client from the ROUTER TREE KEYS: `apiContract.public.content.home` answers at
  `/rpc/public/content/home`, so tree keys ARE transport URLs and regrouping the tree moves them. The server therefore
  runs every `/rpc/*` request through a legacy request-path adapter
  ([packages/server/src/http/request/legacy-rpc-path.ts](../packages/server/src/http/request/legacy-rpc-path.ts)) that
  rewrites the 49 pre-grouping URLs (`/rpc/content/*` → `/rpc/public/content/*`, `/rpc/analytics/*` →
  `/rpc/admin/analytics/*`, `/rpc/{likes,friends,newsletter,notifications,passkey}/*` → `/rpc/account/*`, per-procedure
  for `comments`) onto the canonical grouped paths before the handler — already-deployed old clients keep working, while
  every in-repo caller and any new headless client uses the canonical `/rpc/{public,account,admin}/*` paths.
- **Two graphs, don't confuse them.** The _package install graph_ says `@kobato/api` depends on `@orpc/contract` and
  `@orpc/client`. The _module import graph_ is finer: imports are module-direct (no barrels, no re-exports — consumers
  import `@kobato/api/<module>.ts` straight from the source), and `src/contracts/` imports no `@orpc/*` package at all.
  A schema-only consumer therefore pulls no RPC runtime into its module graph — enforced by arch test, not assumed from
  tree-shaking.
- **The client factories** — `client/create-client.ts` exports two functions over one transport.
  `createKobatoClient({ url, fetch?, getHeaders? })` returns `ContractRouterClient<typeof apiContract>`;
  `createKobatoPublicClient(options)` narrows the same options and transport to
  `ContractRouterClient<typeof publicContract>` — the headless public seam: external consumers call `client.content.*` /
  `client.comments.*` against the canonical `/rpc/public/*` URLs, and no `account`/`admin` surface is reachable from the
  returned client (a type-level guarantee). The server exempts exactly the frozen anonymous public-read procedures
  (sixteen exact paths, [legacy aliases](../packages/server/src/http/request/public-read-rpc-path.ts) equivalent) from
  the CSRF guard, so headless reads work bare; writes and token reads keep the same-origin cookie + CSRF pair. Both are
  React-free with no ambient state: no singleton, no CSRF store, no `location`. `url` is the FULL RPC URL
  (`https://host/rpc`), never the site origin. `client/error.ts` decodes the wire error payload
  (`extractApiErrorMessage`, `apiErrorDescriptorKey` — error side) and the response payload (`isApiAccepted` — response
  side); keep the two sides distinct.
- **Who assembles what.** `@kobato/web-client/api/client.ts` owns the browser singleton assembly — the same-origin
  `${location.origin}/rpc` default, the CSRF token store + `setCsrfToken`, and the React Query wrappers
  (`api/orpc-query`) — delegating to the factory (the browser keeps the full grouped tree). The built-in frontend's SSR
  calls the same contract in process through `createSsrCaller` (no HTTP hop). An external frontend calls `/rpc/*` from
  its server through `createKobatoPublicClient`. Three callers, one contract
  ([ADR-0009 §4](adr/0009-optional-headless-frontends.md)); the public seam's exact surface is pinned by
  [apps/kobato/tests/arch/public-api-contract.test.ts](../apps/kobato/tests/arch/public-api-contract.test.ts), and the
  consumer-facing guide is [docs/manual/Headless.md](manual/Headless.md).
- **The auth routes are in-process callers too — no exception to one contract.** The React Router signin and setup
  routes no longer call domain services directly: after the install gate and the global CSRF guard, their loaders and
  form actions call `account.auth.*`, `account.setup.*`, and `account.passkey.authBegin`/`authFinish` through
  `createSsrCaller` ([packages/server/AGENTS.md](../packages/server/AGENTS.md) has the controller detail).
  `routes/auth/flow-response.ts` is pure wire-to-route adaptation — it maps the `AuthFlowOutput` union
  (`redirect`/`error`/`success`) onto React Router `redirect`/`data` and forwards `Set-Cookie` from the in-process
  `responseHeaders`; cookies travel as real headers on both the in-process and the HTTP `/rpc` transport, never inside
  the JSON payload.

## Adding an endpoint

The **wire declaration** is centralized in one package — schema, procedure metadata, and composition all live in
`@kobato/api`. The implementation, the parity test, and the callers still change with their own responsibilities:

1. **Schema** — declare input/output in `packages/api/src/contracts/<domain>.ts` (never inline). Multi-column
   field-update procedures must use `mergePatchInput` from `@kobato/api/contracts/merge-patch`.
2. **Procedure** — declare it in `packages/api/src/rpc/<group>/<domain>.ts` (`public/`, `account/`, or `admin/`),
   composing the schema by reference. Route paths are the stable wire surface: they must never drift from deployed URLs
   — public URLs, feed URLs, image endpoints, and WordPress-compatibility routes are preserved as they are.
3. **Composition** — for a new domain only: add it to its group root (`public-contract.ts` / `account-contract.ts` /
   `admin-contract.ts`) and thereby to `src/contract.ts`, which mirrors the server `apiRouter` groups exactly. A new
   tree key is also a new `/rpc/<group>/…` transport URL — the canonical surface for new callers.
4. **SDK tests** — contract shape pins under `packages/api/tests/unit/` (key sets, method/path values, parse behavior),
   split by group; the composition test covers the full tree.
5. **Implementation** — in `@kobato/server`: implement through the right `implement{Public,Authed,Author,Admin}` base
   (`packages/server/src/http/orpc-base.ts`) in the domain's controller under `http/controllers/<group>/` and register
   it in the matching `apiRouter` group in `http/api-router.ts`. The full-tree parity test
   ([packages/server/tests/unit/server/http/api-contract.test.ts](../packages/server/tests/unit/server/http/api-contract.test.ts))
   fails until every declared procedure is implemented and vice versa.
6. **Callers** — web surfaces call `orpc.<group>.<domain>.<endpoint>(flatInput)` through
   `@kobato/web-client/api/client`; app routes go through loaders / `createSsrCaller`; an external frontend uses
   `createKobatoPublicClient` ([docs/manual/Headless.md](manual/Headless.md)).
7. **Public-contract discipline** — if the endpoint lands in the `public` group (`content`, `comments`, `webmentions`,
   `avatar`, `github`, `images`, `music`), it joins the guaranteed headless surface pinned by
   [apps/kobato/tests/arch/public-api-contract.test.ts](../apps/kobato/tests/arch/public-api-contract.test.ts): update
   the manifest there in the same change, keep additions additive until a Kobato major, and let compatibility ride the
   repository version ([ADR-0009 §2](adr/0009-optional-headless-frontends.md)).
8. **Verify** — `pnpm test packages/api packages/server/tests/unit/server/http`, plus the boundary pins:
   `pnpm test apps/kobato/tests/arch`. The full gate (`pnpm run type`, `pnpm run test`, `pnpm run build`) runs before
   every commit anyway.

## Where SEO and telemetry live

Neither is a package — each is a documented layer inside a shared leaf:

- **SEO presentation metadata** lives in `@kobato/catalog/seo` — route-meta builders (`routeMeta`, `pageTitle`,
  `seoForPost`, …) and the OG image path grammar. Route title/meta resolution stays in the app and server layers: the
  app's typed route-meta factory (`apps/kobato/src/seo/`) feeds React Router's `meta` export, and the server's feed/OG
  renderers import the same builders. `web-admin` and `web-public` never import `@kobato/catalog/seo`.
- **The telemetry protocol** lives in `@kobato/settings/telemetry` — RUM vocabulary and bootstrap/intake, OpenObserve
  stream/metric names, privacy-pipeline identity — colocated with the RUM client identity in
  `settings/sections/observability.ts`. Runtime adapters stay with their consumers: OpenTelemetry in
  `packages/server/src/infra/trace/`, the browser RUM SDK in `packages/web/client/src/lib/rum/` (pointed at the
  same-origin `/api/rum/intake` relay), DEV container tooling in `tools/trace`. Wire DTOs (analytics, observability) are
  ordinary `@kobato/api/contracts` modules.
