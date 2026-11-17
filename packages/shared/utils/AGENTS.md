# `@kobato/utils`

Pure isomorphic helpers with no domain knowledge. Owner of: `slug` + `slug-char-map`, `urls`, `safe-url`, `security`, `theme-cookie`, `thumbhash`, `toc`, `memo`, `id`, `is-bot`, `roles`, `sessions-sort`, `schema`, `tools`, `type-guards` / `type-equals` / `unsafe-cast`, `avatar`, `comments`, `zod-issue-bounds`, plus the display `format` facade (the ONE surface for user-visible dates/numbers/byte sizes/durations/DisplayNames — always an explicit locale + site time zone, cached formatter instances) and `version`. `formatter.ts` keeps only the site-zone date primitives and the `formatShowDate` compatibility wrapper.

- Allowed deps: `@kobato/i18n` only (locale types). Never contracts, settings, cache, assets, pt, sanitize, or any product package.
- Bans: no React, no `node:*` value imports (umbrella rules in `packages/shared/AGENTS.md` apply).
- Tests: `tests/unit/` (runs through the umbrella `shared-unit` project — see `packages/shared/tests/AGENTS.md`).
