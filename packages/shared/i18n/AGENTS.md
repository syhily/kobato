# `@kobato/i18n`

The locale layer: `locales` (the four supported tags, alias normalization, `og:locale` spelling, endonyms),
`content-language` (author metadata, never a UI-locale selector), `messages/ui/*` + `messages/server/*` (English defines
the message-id types; the other three `satisfies` them), `catalog` (aggregation + English fallback merge + ICU
validation; server-only value import), `catalog-scope` (the client-safe `public | workspace` classifier),
`fallback-messages` (the only message module the client may import directly), `inkling-labels/*` (the editor chrome's
flat tables, outside ICU because Inkling's `{max}`/`{cardType}` tokens are `string.replace`).

- Allowed deps: none. No React, no display formatting (that is `@kobato/utils/format`).
- `uiMessagesForScope(locale, scope)` is memoized and frozen; public scope is the `PUBLIC_MESSAGE_PREFIXES` allowlist
  (`apps/kobato/tests/arch/public-message-namespaces.test.ts`). The `inkling-labels` aggregator is a server-only value
  import; no client module statically imports a table (`apps/kobato/tests/arch/client-bundle.test.ts`).
- Tests: `tests/unit/` (`shared-unit`). Key parity + ICU shape parity: `catalog.test.ts` (ui + server) and
  `inkling-labels.test.ts`. Translation completeness — no blank value, no value identical to the English baseline
  outside `SHARED_WITH_ENGLISH`, no Chinese in the baseline outside `HAN_IN_ENGLISH` — over ui, server, and inkling:
  `catalog-completeness.test.ts`; a key that legitimately keeps the English text (brand, protocol, identifier,
  placeholder) is listed there, never left implicit. `tests/utils/i18n.ts` is the WORKSPACE-canonical translator fixture
  (`makeTranslator`, `tZhCN`, `rootMatchesWithI18n`) — import it cross-package, never keep a copy.
