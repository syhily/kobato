# `@kobato/contracts`

The wire layer — everything that crosses a transport or package boundary as data.

- Owner of the per-domain Zod schemas + derived DTOs (`content`, `posts`, `pages`, `comments`, `likes`, `users` incl.
  the `account.*` family, `images`, `analytics`, `settings` envelope, `notifications`, `observability`, `backup`,
  `sessions`, `webmentions`, …). The `likes` wire family is the schema single source the `@kobato/api` likes contract
  composes.
- `api-error` — `ErrorMessageDescriptor` / `ErrorIssueWire` / `ApiErrorData`: producers state a typed id, the server
  translates per request, every issue carries BOTH the display `message` and the descriptor. Also owns `zodIssueParams`,
  the ONE issue-params extractor.
- `primitives` — the shared Zod primitives (`idString`, `isoDateTime`, `safeBoolean`, `honeypotField`, …) that
  per-domain schemas compose; only schemas with no single domain owner belong here (`content-admin-base.ts` is
  content-specific, NOT a primitives candidate).
- `merge-patch` — the contract for multi-column field-update procedures (`mergePatchInput` / `clearable` /
  `splitMergePatch`); the users domain is its current production consumer — adopt it for new field-update procedures,
  don't cite it as broader precedent.
- `comments.ts` is the single comments wire owner (DTOs, parse/serialize pair, oRPC interfaces, the
  `{ count, roots_count }` summary). PII-heavy admin rows keep their server-side model in
  `@kobato/server/domains/comments/types.ts` (parity assert in the server's `projection.ts`).
- Moved out (do not move back): the public read model → `@kobato/catalog`; route-warmup/SEA constants →
  `@kobato/distribution`; the `trace*` protocol → `@kobato/telemetry`.
- A UI-only helper never lives here, even when pure (display derivation belongs to the consuming web leaf).
- Allowed deps: `@kobato/auth`, `@kobato/catalog`, `@kobato/settings`, `@kobato/i18n`, `@kobato/utils`,
  `@kobato/inkling` (headless), `@kobato/assets`, `@kobato/cache`. Nothing imports "back down" — db/server/ui/web import
  contracts, never the reverse.
- Zod DTO single source: each wire DTO is declared once as a Zod schema; its TS type derives in the same module
  (`z.infer`); no hand-written DTO twins. Exception: SSR output schemas use `z.custom<T>()` over loader-data types
  (scoped to `content.ts` and the per-domain admin families). `MetaDescriptor` arrives as an erased react-router
  `import type`.
- Tests: `tests/unit/` (`shared-unit`). `tests/utils/catalog.ts` is the workspace-canonical content and DTO fixture;
  other packages' test trees import it through the sanctioned cross-package helper seam.
