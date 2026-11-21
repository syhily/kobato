# `@kobato/api`

The API SDK — one package owning both halves of the wire surface: the Zod vocabulary (`src/contracts/`) and the oRPC
procedure metadata (`src/rpc/`) that composes it. An endpoint's wire schema and procedure metadata are declared here and
only here — server implementations, callers, and their tests change with their own responsibilities. Controllers in
`@kobato/server` implement the procedures through the `implement*` bases in `packages/server/src/http/orpc-base.ts`, and
handlers own no schema or route metadata of their own.

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
- `src/client/` — reserved for the Phase 3 transport factory (React-free `createKobatoClient`); nothing lives there yet.

## Rules

- Allowed deps: `@orpc/contract` (rpc layer only) plus the eight shared leaves `auth`, `catalog`, `settings`, `i18n`,
  `utils`, inkling `/headless`, `assets`, `cache`. `src/contracts/` imports no `@orpc/*` package and never imports
  `src/rpc/` or `src/client/` — schema-only consumers stay free of the RPC runtime
  (`apps/kobato/tests/arch/shared-react-free.test.ts`).
- Runtime-isomorphic and React-free (same rules as the shared umbrella): safe in both bundles, no node/DOM-only APIs, no
  logger — validation behavior belongs to whatever runtime executes the contract.
- No barrel `index.ts`, no `export { X } from 'y'` re-exports — consumers import `@kobato/api/<module>.ts` straight from
  the source file.
- Auth, CSRF, rate limits, tracing, and the `HandlerContext` stay server-side — a contract carries only
  transport-visible metadata, never behavior.
- Tests: `tests/unit/` (`api-unit`) — contract shape pins: key sets, route method/path values, schema-object identity
  against `@kobato/api/contracts`, input/output parse behavior. `contract.test.ts` pins the complete composition; the
  server-side full-tree parity test compares every implemented procedure against this package. `tests/utils/catalog.ts`
  is the workspace-canonical content and DTO fixture; other packages' test trees import it through the sanctioned
  cross-package helper seam.
