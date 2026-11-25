# `@kobato/api`

The API SDK: the Zod wire vocabulary (`src/contracts/`), the oRPC procedure metadata (`src/rpc/`) composed from it, the
React-free client transport (`src/client/`), and the built-in frontend's browser assembly (`src/browser/`). An
endpoint's wire schema and procedure metadata are declared here and only here; controllers in `@kobato/server` implement
them through the `implement*` bases in `packages/server/src/http/orpc-base.ts` and own no schema or route metadata of
their own.

## Layout

- `src/contracts/` — per-domain Zod schemas + derived DTOs in three audience layers plus the audience-free root
  `primitives.ts`: `public/` serves the anonymous surface, `account/` the viewer, `admin/` the back-office domains.
  - Dependency direction is one-way: the root imports no audience layer, `public/` only itself and the root, `account/`
    may also reach `public/`, and `admin/` may reach `public/` and `account/`. Vocabulary a second audience needs lives
    in the lower layer — never duplicated, never shimmed through re-exports.
  - Root `primitives.ts` holds only generic wire vocabulary with no single domain owner: shared Zod scalars, output
    envelopes, error descriptors, `zodIssueParams` (the ONE issue-params extractor), and `mergePatchInput` / `clearable`
    / `splitMergePatch` for multi-column field-update procedures.
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
    the HTTP method; `tests/unit/public-read-meta.test.ts` freezes the exact marked key set (seventeen public reads;
    token reads, comment mutations, and the account/admin surface stay unmarked). A separate `csrfExempt` meta is frozen
    to the anonymous device beacon, the backup download, and the two author music media GETs; it never implies anonymous
    access and never replaces the role guard.
  - `requestTimeoutMs`, `requestBodyLimit`, `installGateExempt`, and `telemetryExcluded` compose on one procedure, and
    canonical-path derivations share `rpc/metadata.ts`; the server derives its timeout overrides, body caps, and
    install-gate/telemetry policy sets from this metadata instead of parallel path tables.
- Two URL surfaces, never conflated: the **route method/path metadata** is a REST-style compatibility record of deployed
  historical URLs — it must never drift and no REST surface is mounted from it. The **`/rpc/*` transport URLs** derive
  from the ROUTER TREE KEYS (`apiContract.public.content.home` answers at `/rpc/public/content/home`), so tree keys ARE
  RPC transport URLs and the canonical grouped `/rpc/{public,account,admin}/*` paths are the ONLY transport.
- `src/{public,account,admin}-contract.ts` — the per-group composition roots; they compose domain contracts and never
  declare, forward, or re-export procedures. The account group carries the authentication + install surface on the wire
  (`account.auth.*`, `account.setup.*`): the app's signin and setup routes drive it in-process through
  `createSsrCaller`; `createKobatoPublicClient` exposes none of it. `public.content.bootstrap` carries the public
  `currentUser` state for the headless seam.
- `src/contract.ts` — the composition root (`@kobato/api/contract`): `apiContract = { public, account, admin }`,
  mirroring the server's `apiRouter` nesting exactly. Adding or removing a domain means updating its group root, this
  tree, and the full server parity test.
- `src/client/` — the React-free transport. `createKobatoClient({ url, fetch?, getHeaders? })` returns
  `ContractRouterClient<typeof apiContract>`: `url` is the FULL RPC URL (`https://host/rpc`), never the site origin. The
  factory is ambient-free — no singleton, no CSRF store, no `location`; ambient assembly is the consumer's job
  (`src/browser/` is the built-in frontend's). `createKobatoPublicClient` is the headless public seam — the same
  transport narrowed to `ContractRouterClient<typeof publicContract>`, a type-level guarantee that external consumers
  reach only `/rpc/public/*`. `error.ts` decodes wire payloads: `extractApiErrorMessage` and `apiErrorDescriptorKey`
  read the ERROR payload, while `isApiAccepted` is a RESPONSE-payload guard — keep the two sides distinct.
  `rpc-serialization.ts` owns RPC input/query/multipart encoding and response/error decoding for `sendBeacon` and the
  backup progress XHR; `rum-intake.ts` owns the external OpenObserve intake proxy URL.
- `src/browser/` — the built-in frontend's browser assembly, and the ONLY UI-bound, ambient part of the package:
  `client.ts` is the browser singleton (`orpc` + `setCsrfToken` — the CSRF token store and the same-origin `/rpc` URL
  default, delegating to `createKobatoClient`), `orpc-query.ts` the TanStack Query binding (`orpcQuery`),
  `query-client.ts` the app's `QueryClient` factory (`makeQueryClient`). It is a leaf: nothing else under `src/` imports
  it, and neither does `@kobato/server`, `@kobato/db`, or a shared leaf.

## Rules

- Allowed deps: `@orpc/contract` (rpc + client), `@orpc/client` (client only), and the shared leaves `auth`, `catalog`,
  `settings`, `i18n`, `utils`, inkling `/headless`, `assets`; `src/browser/` additionally imports `@orpc/react-query`
  and `@tanstack/react-query`. `react` and `@types/react` are declared only to pin those packages' peer resolution to
  the workspace's single React copy — no module outside `src/browser/` imports them. `src/contracts/` imports no
  `@orpc/*` package and never imports `src/rpc/` or `src/client/` (`apps/kobato/tests/arch/shared-react-free.test.ts`).
- Runtime-isomorphic and React-free outside `src/browser/`: no node/DOM-only APIs, no logger. The contract, rpc, and
  client layers use only the isomorphic web platform — never browser-only globals or ambient mutable state;
  `globalThis.fetch` is only the default fetch adapter. `src/browser/` is the one exemption and never grows a second
  (`apps/kobato/tests/arch/shared-react-free.test.ts`).
- No barrel `index.ts`, no `export { X } from 'y'` re-exports; consumers import `@kobato/api/<module>.ts`.
- Auth, CSRF, rate limits, tracing, and the `HandlerContext` stay server-side: a contract carries only transport-visible
  metadata, never behavior.
- Tests: `tests/unit/` (`api-unit`) pins contract shapes (key sets, route method/path values, schema identity against
  the contracts, parse behavior, per group), the `defineProcedure` factory (`define-procedure.test.ts`), and the frozen
  `publicRead` key set; `tests/unit/client/` pins the transport factory, the real-transport public seam
  (`public-client.test.ts`), and wire error decoding; `tests/unit/browser/` pins the browser singleton assembly. The
  server-side full-tree parity test and `apps/kobato/tests/arch/public-api-contract.test.ts` pin the surfaces.
  `tests/utils/catalog.ts` is the workspace-canonical content and DTO fixture.
