# `@kobato/i18n`

The locale layer: `locales` (the four supported tags, alias normalization, `og:locale` spelling, endonyms),
`content-language` (author metadata, never a UI-locale selector), `messages/ui/*` + `messages/server/*` (English defines
the message-id types; the other three `satisfies` them), `catalog` + `catalog-scope`, `fallback-messages`,
`format-message` (the React-free ICU formatter over a caller-supplied message table — the browser counterpart of the
server translator, fed from the bootstrap payload's `i18n.messages`), and `inkling-labels/*` (the editor chrome's flat
label tables).

- Allowed deps: none. No React, no display formatting (that is `@kobato/utils/format`).
- `uiMessagesForScope(locale, scope)` is memoized and frozen; public scope is the `PUBLIC_MESSAGE_PREFIXES` allowlist
  (`apps/kobato/tests/arch/public-message-namespaces.test.ts`). The `inkling-labels` aggregator is a server-only value
  import; no client module statically imports a table (`apps/kobato/tests/arch/client-bundle.test.ts`).
- Tests: `tests/unit/` (`shared-unit`) — key parity + ICU shape parity (`catalog.test.ts`, `inkling-labels.test.ts`) and
  translation completeness (no blank value, no value identical to the English baseline, no Chinese in the baseline) over
  ui, server, and inkling (`catalog-completeness.test.ts`; a key that legitimately keeps the English text is listed
  there, never left implicit). `tests/utils/i18n.ts` is the WORKSPACE-canonical translator fixture (`makeTranslator`,
  `tZhCN`, `rootMatchesWithI18n`) — import it cross-package, never keep a copy.
