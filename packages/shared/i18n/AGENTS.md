# `@kobato/i18n`

The locale layer. Owner of: `locales` (the four supported tags, alias normalization, `og:locale` spelling, endonyms),
`content-language` (author metadata, never a UI-locale selector), `messages/ui/*` + `messages/server/*` (English defines
the message-id types; the other three `satisfies` them), `catalog` (aggregation + English fallback merge + ICU
validation; server-only value import), `catalog-scope` (the client-safe `public | workspace` classifier),
`fallback-messages` (the only message module the client may import directly), and `inkling-labels/*` (the editor
chrome's flat tables, outside ICU because Inkling's `{max}`/`{cardType}` tokens are `string.replace`).

- Allowed deps: none — this is a leaf. `src/` imports nothing. The inkling-label parity pin lives in
  `packages/inkling/tests/`.
- Key contracts: `uiMessagesForScope(locale, scope)` is memoized and frozen — public scope is the
  `PUBLIC_MESSAGE_PREFIXES` allowlist, pinned by `apps/kobato/tests/arch/public-message-namespaces.test.ts`; the
  `inkling-labels` aggregator is a server-only value import and no client module may statically import a table
  (`apps/kobato/tests/arch/client-bundle.test.ts`).
- Bans: no React, no display formatting (that is `@kobato/utils/format`).
- Tests: `tests/unit/` (`shared-unit`). Key parity and ICU shape parity are pinned by `tests/unit/catalog.test.ts` (ui +
  server) and `tests/unit/inkling-labels.test.ts`; translation completeness — no blank value, no value identical to the
  English baseline outside the reviewed `SHARED_WITH_ENGLISH` list, no Chinese in the baseline outside `HAN_IN_ENGLISH`
  — by `tests/unit/catalog-completeness.test.ts` over all three namespaces. A new key that legitimately keeps the
  English text (brand, protocol, identifier, placeholder) is listed there, never left implicit. `tests/utils/i18n.ts` is
  the WORKSPACE-canonical translator fixture (`makeTranslator`, `tZhCN`, `rootMatchesWithI18n`): other packages' test
  trees import it cross-package — never keep a copy.
