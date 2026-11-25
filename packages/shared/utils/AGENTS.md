# `@kobato/utils`

Pure isomorphic helpers with no domain knowledge: URL and slug primitives (`urls`, `safe-url`, `url-schema`, `slug`),
date/id/memo/sampling helpers, `theme-cookie`, `thumbhash`, type guards, and the display `format` facade (the ONE
surface for user-visible dates/numbers/byte sizes/durations/DisplayNames — explicit locale + site time zone, cached
formatters).

Never move back here: role/security and the SSRF/passkey network boundary (`@kobato/auth`); `toc`
(`@kobato/inkling/headless`); avatar URL rules and the Gravatar mirror policy (`@kobato/assets`); app identity
(`@kobato/distribution/app`); Zod helpers, comment entity parse/serialize, and the `Comments` summary
(`@kobato/api/contracts`); `is-bot` (`@kobato/server/infra/http`); session sort (`@kobato/web-admin/ui/sessions`).

- Allowed deps: `@kobato/i18n` only. Never the api contracts, settings, cache, assets, sanitize, or any product package.
- No React, no `node:*` value imports (umbrella rules apply).
- Tests: `tests/unit/` (`shared-unit`). The ThumbHash snapshot corpus stays in this package's
  `tests/fixtures/thumbhash/`.
