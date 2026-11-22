# `@kobato/api`

The API SDK — one package owning the wire surface end to end: the Zod vocabulary (`src/contracts/`), the oRPC procedure
metadata (`src/rpc/`) that composes it, and the React-free client transport (`src/client/`) that calls it. An endpoint's
wire schema and procedure metadata are declared here and only here — server implementations, callers, and their tests
change with their own responsibilities. Controllers in `@kobato/server` implement the procedures through the
`implement*` bases in `packages/server/src/http/orpc-base.ts`, and handlers own no schema or route metadata of their
own.

## Layout

- `src/contracts/` — the wire vocabulary: per-domain Zod schemas + derived DTOs (`posts`, `pages`, `comments`, `likes`,
  `users` incl. the `account.*` family, `auth` (the sign-in flow wire vocabulary: flow/status/identify unions and the
  camelCase action inputs), `setup` (the install-flow wire vocabulary: status view, verified/429 verify union, and the
  permissive install input whose field-error copy stays server-side), `images`, `analytics`, `settings` envelope,
  `notifications`, `observability`, `backup`, `sessions`, `webmentions`, …), `api-error` (`ErrorMessageDescriptor` /
  `ErrorIssueWire` / `ApiErrorData`, plus `zodIssueParams`, the ONE issue-params extractor), `primitives` (the shared
  Zod primitives — only schemas with no single domain owner), `merge-patch` (`mergePatchInput` / `clearable` /
  `splitMergePatch` for multi-column field-update procedures; the users domain is its production consumer — adopt it for
  new field-update procedures), and `content-admin-base`. `comments.ts` is the single comments wire owner (DTOs,
  parse/serialize pair, oRPC interfaces, the `{ count, roots_count }` summary); PII-heavy admin rows keep their
  server-side model in `@kobato/server/domains/comments/types.ts`. Zod DTO single source: each wire DTO is declared once
  as a Zod schema, its TS type derives in the same module (`z.infer`); no hand-written twins. Exception: SSR output
  schemas use `z.custom<T>()` over loader-data types (`content.ts` and the per-domain admin families); `MetaDescriptor`
  arrives as an erased react-router `import type`. A UI-only helper never lives here, even when pure.
- `src/rpc/` — one module per RPC domain, grouped by audience: contract procedures
  (`oc.route({ method, path }).input(<contracts schema>).output(<contracts schema>)`), composed from `src/contracts/` by
  reference, never a copy. Three groups mirror the contract tree: `rpc/public/` (anonymous consumers: `content`,
  `comments` — the `commentsPublicContract` + `commentsTokenContract` merge exported as `commentsContract`,
  `webmentions`, `avatar`, `github`, `images`, `music`), `rpc/account/` (the signed-in viewer: `self` exporting
  `accountSelfContract`, `auth` exporting `accountAuthContract` — the sign-in flow (`status`/`identify`/`login`/
  `logout`/`magicLink`/`otpVerify`/`otpResend`/`otpCancel`/`passwordResetRequest`/`passwordReset`) plus `authFinish` in
  `passkey`, `setup` exporting `accountSetupContract` — the install flow (`status`/`verifyToken`/`install`), `comments`
  — `commentsAuthedContract` only, `notifications`, `passkey`, `likes`, `friends`, `newsletter`; several of these are
  anonymous writes with their own guards/rate limits — they live here because they belong to the viewer's surface, not
  the headless public seam), and `rpc/admin/` (`<domain>.ts` — every admin surface sits on `/admin/<domain>/…`, plus
  `analytics`, whose oc.route paths stay the legacy `/analytics/*`; `rpc/admin/revision.ts` owns the shared
  revision-contract factory). Composite domains such as `content` mirror the server's nested or merged controller
  composition.
- Two URL surfaces, never conflated: (1) the **oc.route method/path metadata** declared in `src/rpc/` — the REST-style
  wire surface; its values are deployed compatibility contracts and must never drift. (2) the **`/rpc/*` transport
  URLs** — derived by oRPC's `RPCHandler`/client from the ROUTER TREE KEYS (`apiContract.public.content.home` answers at
  `/rpc/public/content/home`). Tree keys therefore ARE RPC transport URLs: regrouping the tree moves them, which is why
  the server keeps a legacy request-path adapter (`packages/server/src/http/request/legacy-rpc-path.ts`) rewriting every
  pre-grouping `/rpc/*` URL (e.g. `/rpc/content/bootstrap` → `/rpc/public/content/bootstrap`, `/rpc/analytics/overview`
  → `/rpc/admin/analytics/overview`, per-procedure for `comments`) onto the canonical grouped path. The grouped paths
  are canonical — every in-repo caller and any NEW headless client uses them; the adapter exists solely so
  already-deployed old clients keep working.
- `src/public-contract.ts` / `src/account-contract.ts` / `src/admin-contract.ts` — the per-group composition roots
  (`publicContract`, `accountContract`, `adminContract`). `accountContract` spreads `accountSelfContract` at its root
  (so `account.profile` etc. keep their historical keys — `/rpc/account/profile` never moved) and mounts the eight
  sub-trees. Like the top root, they compose domain contracts; they do not declare, forward, or re-export procedures.
  The account group carries the authentication + install surface on the wire: `account.auth.*` (status/identify/login/
  logout/magic-link/OTP/password reset), `account.passkey.authBegin`/`authFinish`, and `account.setup.*` (status/
  verify-token/install) are the single such surface — the React Router signin and setup routes drive them in-process
  through `createSsrCaller`, and full-tree workspace clients may reach them over `/rpc/account/auth/*` and
  `/rpc/account/setup/*`; `createKobatoPublicClient` exposes none of them, and ADR-0009 gives them no external stability
  guarantee. `public.content.bootstrap` still carries the public `currentUser` state for the headless seam.
- `src/contract.ts` — the composition root (path unchanged: `@kobato/api/contract`), mirroring the server's `apiRouter`
  nesting exactly (`apiRouter.public.content.home` ⇔ `apiContract.public.content.home`). It composes exactly the three
  group roots: `apiContract = { public, account, admin }`. Adding or removing a domain requires updating its group root,
  this tree, and the full server parity test.
- `src/client/` — the React-free client transport layer. `create-client.ts` exports
  `createKobatoClient({ url, fetch?, getHeaders? })` returning `ContractRouterClient<typeof apiContract>`: `url` is the
  FULL RPC URL (`https://host/rpc`), never the site origin — a function is forwarded to the RPC link's dynamic-URL
  support; `fetch` defaults to delegating `globalThis.fetch(request, init)` (late-bound, receiver-safe); `getHeaders`
  maps onto the RPC link's `headers` option (plain value, promise, or per-call function). It also exports
  `createKobatoPublicClient(options)` — the headless public seam: the same options and transport
  (`createKobatoClient(options).public`), narrowed to `ContractRouterClient<typeof publicContract>` so external
  consumers call `client.content.*` / `client.comments.*` against the canonical `/rpc/public/*` URLs with no
  `account`/`admin` surface (a type-level guarantee). The server exempts exactly the frozen anonymous public-read
  procedures from CSRF, so bare reads work with neither cookie nor header; comment writes and the token reads
  (`getRaw`/`myComments`) still need the same-origin cookie + CSRF pair. The factory stays ambient-free: no singleton,
  no CSRF store, no `location` or other browser assumption — ambient assembly is the consumer's job
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
  against `@kobato/api/contracts`, input/output parse behavior, split by group (`public-contracts`, `account-contracts`,
  `admin`, `contract` composition). `tests/unit/client/` pins the transport factory wiring (URL/fetch/headers
  pass-through, default fetch delegation), the real-transport public seam (`public-client.test.ts`: canonical
  `/rpc/public/*` proxy URL, custom fetch, getHeaders), and the wire error decoding branches. `contract.test.ts` pins
  the three-group composition; the server-side full-tree parity test compares every implemented procedure against this
  package, and `apps/kobato/tests/arch/public-api-contract.test.ts` pins the public seam's exact surface.
  `tests/utils/catalog.ts` is the workspace-canonical content and DTO fixture; other packages' test trees import it
  through the sanctioned cross-package helper seam.
