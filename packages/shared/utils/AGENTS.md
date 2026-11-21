# `@kobato/utils`

Pure isomorphic helpers with no domain knowledge. Owner of: `slug` + `slug-char-map`, `urls`, `safe-url` (pure URL
formatting/navigation only), `url-schema` (the shared HTTP(S) Zod rule and message id), `theme-cookie`, `thumbhash`,
`memo`, `id`, `sampling`, `type-guards` / `type-equals` / `unsafe-cast`, plus the display `format` facade (the ONE
surface for user-visible dates/numbers/byte sizes/durations/DisplayNames — always an explicit locale + site time zone,
cached formatter instances). `site-date.ts` keeps only the site-zone date primitives and the `formatShowDate`
compatibility wrapper. `date-range.ts` owns the shared preset ranges and time-unit selection used by both persistence
queries and wire schemas.

Moved out (do not move back): role/security primitives and the SSRF/passkey network boundary → `@kobato/auth`; `toc` →
`@kobato/inkling/headless`; avatar URL rules and the Gravatar mirror policy → `@kobato/assets`; app identity (`version`)
→ `@kobato/distribution/app`; Zod helpers (`safeBoolean`/`honeypotField`, `zod-issue-bounds`) → `@kobato/contracts`;
comment entity parse/serialize and the `Comments` count summary → `@kobato/contracts/comments`; `is-bot` →
`@kobato/server/infra/http`; session sort → `@kobato/web-admin/ui/sessions`.

- Allowed deps: `@kobato/i18n` only (locale types). Never contracts, settings, cache, assets, sanitize, or any product
  package.
- Bans: no React, no `node:*` value imports (umbrella rules in `packages/shared/AGENTS.md` apply).
- Tests: `tests/unit/` (`shared-unit`). The ThumbHash snapshot corpus is this package's own `tests/fixtures/thumbhash/`;
  keep it local to its only consumer.
