# `@kobato/api`

The API SDK — one package owning the wire surface end to end: the Zod vocabulary (`src/contracts/`), the oRPC procedure
metadata (`src/rpc/`) that composes it, and the React-free client transport (`src/client/`) that calls it. An endpoint's
wire schema and procedure metadata are declared here and only here — server implementations, callers, and their tests
change with their own responsibilities. Controllers in `@kobato/server` implement the procedures through the
`implement*` bases in `packages/server/src/http/orpc-base.ts`, and handlers own no schema or route metadata of their
own.

## Layout

- `src/contracts/` — the wire vocabulary: per-domain Zod schemas + derived DTOs (`posts`, `pages`, `comments`, `likes`,
  `users` incl. the `account.*` family, `images`, `analytics`, `settings` envelope, `notifications`, `observability`,
  `backup`, `sessions`, `webmentions`, …), `api-error` (`ErrorMessageDescriptor` / `ErrorIssueWire` / `ApiErrorData`,
  plus `zodIssueParams`, the ONE issue-params extractor), `primitives` (the shared Zod primitives — only schemas with no
  single domain owner), `merge-patch` (`mergePatchInput` / `clearable` / `splitMergePatch` for multi-column field-update
  procedures; the users domain is its production consumer — adopt it for new field-update procedures), and
  `content-admin-base`. `comments.ts` is the single comments wire owner (DTOs, parse/serialize pair, oRPC interfaces,
  the `{ count, roots_count }` summary); PII-heavy admin rows keep their server-side model in
  `@kobato/server/domains/comments/types.ts`. Zod DTO single source: each wire DTO is declared once as a Zod schema, its
  TS type derives in the same module (`z.infer`); no hand-written twins. Exception: SSR output schemas use
  `z.custom<T>()` over loader-data types (`content.ts` and the per-domain admin families); `MetaDescriptor` arrives as
  an erased react-router `import type`. A UI-only helper never lives here, even when pure.
- `src/rpc/` — one module per RPC domain: contract procedures
  (`oc.route({ method, path }).input(<contracts schema>).output(<contracts schema>)`), composed from `src/contracts/` by
  reference, never a copy. `src/rpc/admin/<domain>.ts` — every admin surface sits on `/admin/<domain>/…`;
  `rpc/admin/revision.ts` owns the shared revision-contract factory. Route paths are the stable wire surface and must
  never drift from deployed URLs. File names and tree keys are NOT URLs — renaming them never changes a deployed path.
  Composite domains such as `content` mirror the server's nested or merged controller composition.
- `src/contract.ts` — the composition root (path unchanged: `@kobato/api/contract`), mirroring the server's `apiRouter`
  nesting exactly (`apiRouter.likes` ⇔ `apiContract.likes`). It composes domain contracts into the tree; it does not
  declare, forward, or re-export procedures. Adding or removing a domain requires updating this tree and the full server
  parity test.
- `src/client/` — the React-free client transport layer. `create-client.ts` exports
  `createKobatoClient({ url, fetch?, getHeaders? })` returning `ContractRouterClient<typeof apiContract>`: `url` is the
  FULL RPC URL (`https://host/rpc`), never the site origin — a function is forwarded to the RPC link's dynamic-URL
  support; `fetch` defaults to delegating `globalThis.fetch(request, init)` (late-bound, receiver-safe); `getHeaders`
  maps onto the RPC link's `headers` option (plain value, promise, or per-call function). No ambient state: no
  singleton, no CSRF store, no `location` or other browser assumption — ambient assembly is the consumer's job
  (`@kobato/web-client` owns the browser singleton). `error.ts` decodes wire error/response payloads:
  `extractApiErrorMessage` and `apiErrorDescriptorKey` read the error payload (the latter from an `ORPCError`
  rejection's `data.descriptor`), while `isApiAccepted` is a RESPONSE-payload guard (`{ accepted: true }`), not an
  error-object test — keep the two sides distinct when adding helpers.

## Rules

- Allowed deps: `@orpc/contract` (rpc + client layers), `@orpc/client` (client layer only), plus the eight shared leaves
  `auth`, `catalog`, `settings`, `i18n`, `utils`, inkling `/headless`, `assets`, `cache`. `src/contracts/` imports no
  `@orpc/*` package and never imports `src/rpc/` or `src/client/` — schema-only consumers stay free of the RPC runtime
  (`apps/kobato/tests/arch/shared-react-free.test.ts`).
- Runtime-isomorphic and React-free (same rules as the shared umbrella): safe in both bundles, no node/DOM-only APIs, no
  logger — validation behavior belongs to whatever runtime executes the contract. The client layer uses only the
  isomorphic web platform (`fetch`/`Request`/`Response`/`Headers`), never `location` or other browser-only globals and
  never ambient mutable state (no singleton, no token store); `globalThis.fetch` appears only as the default fetch
  adapter — resolved at call time and replaceable through the `fetch` option.
- No barrel `index.ts`, no `export { X } from 'y'` re-exports — consumers import `@kobato/api/<module>.ts` straight from
  the source file.
- Auth, CSRF, rate limits, tracing, and the `HandlerContext` stay server-side — a contract carries only
  transport-visible metadata, never behavior.
- Tests: `tests/unit/` (`api-unit`) — contract shape pins: key sets, route method/path values, schema-object identity
  against `@kobato/api/contracts`, input/output parse behavior. `tests/unit/client/` pins the transport factory wiring
  (URL/fetch/headers pass-through, default fetch delegation) and the wire error decoding branches. `contract.test.ts`
  pins the complete composition; the server-side full-tree parity test compares every implemented procedure against this
  package. `tests/utils/catalog.ts` is the workspace-canonical content and DTO fixture; other packages' test trees
  import it through the sanctioned cross-package helper seam.
