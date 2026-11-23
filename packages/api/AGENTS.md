# `@kobato/api`

The API SDK — one package owning the wire surface end to end: the Zod vocabulary (`src/contracts/`), the oRPC procedure
metadata (`src/rpc/`) that composes it, and the React-free client transport (`src/client/`) that calls it. An endpoint's
wire schema and procedure metadata are declared here and only here — server implementations, callers, and their tests
change with their own responsibilities. Controllers in `@kobato/server` implement the procedures through the
`implement*` bases in `packages/server/src/http/orpc-base.ts`, and handlers own no schema or route metadata of their
own.

## Layout

- `src/contracts/` — the wire vocabulary: per-domain Zod schemas + derived DTOs, grouped into three layers mirroring the
  rpc audiences, plus audience-free generic wire vocabulary in the root `primitives.ts`. `public/` (`content`, `github`,
  `avatar` — owner of the `avatarFind*` schemas, split out of the comments vocabulary so one module has one owner,
  `comments` — the comments wire owner: `commentBaseDto`/`commentItemDto`/`ownCommentMutationDto`, the public
  reply/list/token inputs and outputs, `CommentEntityRef` parse/serialize, `LatestComment`, `Comments`,
  `DetailPageComments`, `CommentReq`; PII-heavy admin rows keep their server-side model in
  `@kobato/server/domains/comments/types.ts`, `webmentions` — owner of `WEBMENTION_TYPES` and the public mention DTO,
  `music` — `publicMusicMetaDto` + `musicGet*`, `images` — the thumbhash probe) serves the anonymous surface; `account/`
  (`auth` — the sign-in flow wire vocabulary: flow/status/identify unions and the camelCase action inputs, `setup` — the
  install-flow wire vocabulary: status view, verified/429 verify union, and the permissive install input whose
  field-error copy stays server-side, `self` — the viewer's own profile/session/login-method/password vocabulary
  (`LOGIN_METHODS`/`loginMethodSchema`/`LoginMethod`, `newPasswordSchema`, `AccountProfile`, `AccountSessionDto`,
  `MySessionItem`), `passkey` — the self and sign-in passkey vocabulary, `comments` — the viewer's own-comments
  vocabulary (the rpc composition reuses the mutation output `ownCommentMutationDto` from `public/comments`), `friends`
  — the friend-application input, `notifications`, `likes`, `newsletter`) serves the viewer; `admin/` holds the
  back-office domains (`posts`, `pages`, `users` — reusing `loginMethodSchema` and `AccountSessionDto` from
  `account/self`, `comments` — reusing `commentBaseDto` from `public/comments`, `music` — `METING_SOURCES` and the
  library/search schemas, `images`, `friends`, `notifications`, `webmentions` — reusing `WEBMENTION_TYPES` from
  `public/webmentions`, `analytics`, `settings` envelope, `observability`, `backup`, `content-admin-base`, …). The root
  `primitives.ts` has no audience: shared Zod scalars and output envelopes, `ErrorMessageDescriptor` / `ErrorIssueWire`
  / `ApiErrorData` plus `zodIssueParams` (the ONE issue-params extractor), and `mergePatchInput` / `clearable` /
  `splitMergePatch` for multi-column field-update procedures; the users domain is their production consumer — adopt them
  for new field-update procedures. Only generic wire vocabulary with no single domain owner belongs here. Dependency
  direction is one-way: the root module imports no audience layer, `public/` imports only itself and the root,
  `account/` may also reach `public/`, and `admin/` may reach `public/` and `account/` — vocabulary a second audience
  needs lives in the lower layer, never duplicated and never shimmed: the old `shared/` layer and separate `api-error` /
  `merge-patch` modules are gone and carry no re-export compatibility. Zod DTO single source: each wire DTO is declared
  once as a Zod schema, its TS type derives in the same module (`z.infer`); no hand-written twins. Exception: SSR output
  schemas use `z.custom<T>()` over loader-data types (`public/content.ts` and the per-domain admin families);
  `MetaDescriptor` arrives as an erased react-router `import type`. A UI-only helper never lives here, even when pure.
- `src/rpc/` — one module per RPC domain, grouped by audience: contract procedures declared with
  `defineProcedure({ method, path })` from `src/rpc/define-procedure.ts` — the oRPC contract procedure plus a type-level
  method/path brand on `~orpc.route` that the server's implementation-shape check consumes. `defineProcedure` is the
  ONLY production declaration way: `define-procedure.ts` is the single `oc.route` call site in `src/rpc/`, and the
  server fails closed on any unbranded contract leaf — a plain `oc.route` procedure satisfies neither `impl.router()`
  nor the `apiRouter` shape, so it cannot compile into the product tree. Its type parameters are `const`, so a factory
  building paths from a generic base must type that base as `` `/${TBase}` ``
  (`revisionContract<const TBase extends string>(basePath: `/${TBase}`)`) — the leading slash stays a literal in the
  derived path types, the call site still passes `'/admin/posts'`, and TS cannot widen the brand; a plain
  `` basePath: `/${string}` `` parameter WOULD widen every derived path to `` `/${string}/…` ``. Procedures are composed
  from `src/contracts/` by reference, never a copy. Anonymous-read eligibility is declared the same way, per procedure:
  `defineProcedure({ method, path }, { publicRead: true })` writes `publicRead: true` onto `~orpc.meta` through oRPC's
  own `$meta` chain (never the route compatibility record), preserved by every `.input()`/`.output()` link and pinned at
  the type level (`PublicReadMeta` vs `NoMeta`). The flag is the transport-visible declaration that a procedure may
  answer with neither cookie nor CSRF header; the server derives its frozen CSRF exemption set from it, while
  enforcement stays entirely server-side. Eligibility is an explicit opt-in — never inferred from the HTTP method (the
  RPC transport POSTs reads too) — and `tests/unit/public-read-meta.test.ts` freezes the exact marked key set (the
  sixteen public reads; token reads, comment mutations, and the whole account/admin surface stay unmarked). Three groups
  mirror the contract tree: `rpc/public/` (anonymous consumers: `content`, `comments` — the `commentsPublicContract` +
  `commentsTokenContract` merge exported as `commentsContract`, `webmentions`, `avatar`, `github`, `images`, `music`),
  `rpc/account/` (the signed-in viewer: `self` exporting `accountSelfContract`, `auth` exporting `accountAuthContract` —
  the sign-in flow (`status`/`identify`/`login`/
  `logout`/`magicLink`/`otpVerify`/`otpResend`/`otpCancel`/`passwordResetRequest`/`passwordReset`) plus `authFinish` in
  `passkey`, `setup` exporting `accountSetupContract` — the install flow (`status`/`verifyToken`/`install`), `comments`
  — `commentsAuthedContract` only, `notifications`, `passkey`, `likes`, `friends`, `newsletter`; several of these are
  anonymous writes with their own guards/rate limits — they live here because they belong to the viewer's surface, not
  the headless public seam), and `rpc/admin/` (`<domain>.ts` — every admin surface sits on `/admin/<domain>/…`, plus
  `analytics`, whose declared route paths stay the legacy `/analytics/*`; `rpc/admin/revision.ts` owns the shared
  revision-contract factory). Composite domains such as `content` mirror the server's nested or merged controller
  composition.
- Two URL surfaces, never conflated: (1) the **route method/path metadata** declared in `src/rpc/` — the REST-style
  compatibility record; its values are deployed historical URLs and must never drift, and no REST surface is mounted
  from them (the transport speaks oRPC's RPC protocol). (2) the **`/rpc/*` transport URLs** — derived by oRPC's
  `RPCHandler`/client from the ROUTER TREE KEYS (`apiContract.public.content.home` answers at
  `/rpc/public/content/home`). Tree keys therefore ARE RPC transport URLs: regrouping the tree moves them. The canonical
  grouped `/rpc/{public,account,admin}/*` paths are the ONLY transport — every in-repo caller and every headless client
  uses them; the pre-grouping alias adapter was removed (ADR-0009 §5).
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
  `account`/`admin` surface (a type-level guarantee). The server exempts exactly the `publicRead`-marked procedures from
  CSRF, so bare reads work with neither cookie nor header; comment writes and the token reads (`getRaw`/`myComments`)
  still need the same-origin cookie + CSRF pair. The factory stays ambient-free: no singleton, no CSRF store, no
  `location` or other browser assumption — ambient assembly is the consumer's job (`@kobato/web-client` owns the browser
  singleton). `error.ts` decodes wire error/response payloads: `extractApiErrorMessage` and `apiErrorDescriptorKey` read
  the error payload (the latter from an `ORPCError` rejection's `data.descriptor`), while `isApiAccepted` is a
  RESPONSE-payload guard (`{ accepted: true }`), not an error-object test — keep the two sides distinct when adding
  helpers.

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
  transport-visible metadata, never behavior. `publicRead` is the one such eligibility declaration: it says a procedure
  MAY serve anonymous reads; the CSRF exemption enforcing that claim is derived and enforced server-side.
- Tests: `tests/unit/` (`api-unit`) — contract shape pins: key sets, route method/path values, schema-object identity
  against `@kobato/api/contracts`, input/output parse behavior, split by group (`public-contracts`, `account-contracts`,
  `admin`, `contract` composition); `define-procedure.test.ts` pins the `defineProcedure` factory (runtime route/schema
  identity plus the method/path literal and schema types, positive and negative), and `public-read-meta.test.ts` freezes
  the exact `publicRead`-marked key set with positive and negative type pins. `tests/unit/client/` pins the transport
  factory wiring (URL/fetch/headers pass-through, default fetch delegation), the real-transport public seam
  (`public-client.test.ts`: canonical `/rpc/public/*` proxy URL, custom fetch, getHeaders), and the wire error decoding
  branches. `contract.test.ts` pins the three-group composition; the server-side full-tree parity test compares every
  implemented procedure against this package, and `apps/kobato/tests/arch/public-api-contract.test.ts` pins the public
  seam's exact surface. `tests/utils/catalog.ts` is the workspace-canonical content and DTO fixture; other packages'
  test trees import it through the sanctioned cross-package helper seam.
