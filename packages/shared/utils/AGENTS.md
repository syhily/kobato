# `@kobato/utils`

Pure isomorphic helpers with no domain knowledge. Owner of: `slug` + `slug-char-map`, `urls`, `safe-url`, `theme-cookie`, `thumbhash`, `memo`, `id`, `sampling`, `type-guards` / `type-equals` / `unsafe-cast`, plus the display `format` facade (the ONE surface for user-visible dates/numbers/byte sizes/durations/DisplayNames — always an explicit locale + site time zone, cached formatter instances). `formatter.ts` keeps only the site-zone date primitives and the `formatShowDate` compatibility wrapper.

Moved out (do not move back): role/security primitives → `@kobato/auth`; `toc` → `@kobato/lexical`; `avatar` → `@kobato/assets`; app identity (`version`) → `@kobato/distribution/app`; Zod helpers (`schema`'s `safeBoolean`/`honeypotField`, `zod-issue-bounds`) → `@kobato/contracts` (`primitives` / `api-error`); comment entity parse/serialize and the `Comments` count summary → `@kobato/contracts/comments`; `is-bot` → `@kobato/server/infra/http`; session sort → `@kobato/web-admin/ui/sessions`.

- Allowed deps: `@kobato/i18n` only (locale types). Never contracts, settings, cache, assets, lexical, sanitize, or any product package.
- Bans: no React, no `node:*` value imports (umbrella rules in `packages/shared/AGENTS.md` apply).
- Tests: `tests/unit/` (runs through the umbrella `shared-unit` project — see `packages/shared/tests/AGENTS.md`). The ThumbHash snapshot corpus is this package's own `tests/fixtures/thumbhash/`; keep it local to its only consumer.
