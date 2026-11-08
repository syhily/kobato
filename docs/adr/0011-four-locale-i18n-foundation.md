# ADR-0011: Four-locale i18n — one global UI locale, typed ICU catalogs, follow-the-locale dates

- Status: accepted
- Date: 2026-11-08
- Basis: commit `7c9d8c9c`; plan 001 (`plans/001-i18n-support.md`), released through
  Step 6 (Steps 1–6c)

## Context

Kobato already stored `siteIdentity.locale`, `timeZone` and `timeFormat` and
emitted `<html lang>`, but the locale drove nothing: interface copy, validation
messages, errors, emails, feeds and date formatting were Chinese hardcoded at
their call sites, `locale` accepted any BCP 47 string, and `timeFormat` was a
required free-form token pattern.

Four facts shaped this step:

- **The stored `locale` is untrusted legacy data.** Rows written before a
  closed locale set may carry `zh`, `zh-Hans-CN`, `zh-Hant-HK` or an arbitrary
  tag. Hydration drops a section whose row fails its schema, and a missing
  `siteIdentity` makes the site read as _not installed_ — so a single odd tag
  could brick an installed blog.
- **`timeFormat` cannot distinguish "default" from "pinned".** Every stored row
  has a value (the install seed wrote `yyyy-LL-dd HH:mm`), so there is no way to
  tell an admin's deliberate pattern from the old seed.
- **Message text must ship inside the SEA binary.** No runtime file reads: the
  catalogs are TypeScript modules in the server bundle, never JSON on disk.
- **The client must not carry the whole corpus.** Only the current locale's UI
  catalog reaches the browser, through the root loader; server-only copy
  (email, notifications) never does.

## Decision

**A closed locale set, canonicalized on every seam.** `en-US`, `zh-HK`,
`zh-TW`, `zh-CN` (`src/shared/i18n/locales.ts`), tags used verbatim for HTML
`lang`, `Content-Language`, RSS `language` and Atom `xml:lang`; only `og:locale`
maps to the underscore spelling. The read schema canonicalizes documented
aliases (`zh`, `zh-Hans-CN`, `zh-Hant-TW`, case-insensitive, `_` tolerated) and
falls back to `zh-CN` for anything unknown, so a legacy value can never fail
hydration. A one-time, idempotent boot pass
(`domains/settings/services/locale-migration.ts`) rewrites the stored value
before the snapshot is built — no `system.*` flag row, because settings are
single-row data and a canonical value performs zero writes.

`zh-HK` and `zh-TW` are independent, hand-reviewed catalogs. No Simplified ↔
Traditional conversion runs at build or runtime, and no fallback chain
connects them.

**`timeFormat: string | null`.** `null` means "follow the locale" and renders
through `Intl.DateTimeFormat` (`dateStyle`/`timeStyle`: short) in the site time
zone; any string stays a custom pattern substituted token-by-token (never
handed to date-fns). Every stored value — including the old install seed — is
preserved as custom, so upgrading changes no existing site's display, while a
fresh install now follows the locale.

**English is the catalog baseline; every locale is type-checked against it.**
`messages/ui/en-US.ts` and `messages/server/en-US.ts` define `UiMessageId` /
`ServerMessageId`; the other three locales use `satisfies` so a missing or
extra key fails `tsc`. `shared/i18n/catalog.ts` aggregates the four locales per
namespace, merges each over the English baseline, and validates the ICU
contract: identical argument names and kinds (plain/plural/select/number/date/
time/rich-text tag), plural categories legal for the locale's
`Intl.PluralRules` (categories themselves may differ — English one/other vs
Chinese other-only), `other` present, and select options covering the baseline's
values. Violations throw; `shared/` has no logger, so the root-loader and the
server translator boundaries catch, log, and degrade.

**One ICU engine, two surfaces.** The server formats through react-intl's
`createIntl` (`server/infra/i18n.ts`), the client through `IntlProvider` — no
second ICU implementation. Server translators are cached per immutable locale,
never per request: no module-level "current locale" exists, so background jobs,
emails and notifications must resolve the locale explicitly.

**Bundle boundary.** `messages/ui/**`, `messages/server/**` and `catalog.ts`
are server-side value imports: the client receives one locale's UI catalog from
the root loader (`content.bootstrap` → `i18n: { locale, messages }`).
`fallback-messages.ts` is the single sanctioned exception — a small module
duplicated from the Simplified Chinese catalog (parity pinned by test) holding
the root ErrorBoundary copy plus the no-payload meta fallbacks (pre-install
title, page `article:section`). It is the only language source used when no
`i18n` payload exists; meta never emits an empty section or its own literal.

**One provider, meta reads matches.** The root `Layout` owns the only
react-intl provider, fed from the loader payload (falling back to
`fallback-messages` when the root loader failed — that path renders the minimal
`ErrorView`, never the public chrome). Route `meta()` re-runs on client
navigation, so static titles are message ids resolved from the root match's
payload (`i18nFromMatches`), never from the server settings snapshot or a
server translator; raw content titles stay raw strings. `og:locale` maps
through `toOpenGraphLocale`, and a page's `article:section` is catalog copy.

**Release flag.** `I18N_SETTINGS_ENABLED` is now `true`: the General settings
card exposes the language selector to every admin. Locale writes were always
constrained to the closed set, so the switch is a UI exposure, not a data
migration; changing the language reloads the page once every dirty settings
card has been saved (see the flush flow under Consequences).

**A scanner, not a grep.** `tests/_helpers/i18n-literals.ts` walks the AST for
JSX text, `aria-label`/`placeholder`/`title`/`alt`, `titleMeta()` arguments,
toast and `DomainError` copy, locale-less `toLocale*()` calls and hardcoded
locale literals. Its final scope is the **whole production tree** (`src/**`, one
root). The allowlist is exact — file, rule and (where applicable) snippet, each
with a written reason; it covers only non-copy data and protocol values
(locale identity tables, the pinyin transliteration map, inkling glyphs and the
emoji-mart locale id, developer invariants, third-party/widget protocol
parameters).

## Consequences

- An installed site can never read as uninstalled because of its locale, and
  the alias rewrite is safe to re-run on every boot.
- Existing sites keep their date display exactly; new installs get
  locale-appropriate dates without any admin action.
- Static route titles are message ids now: `titleMeta('meta.title.…')` fails
  `tsc` for a missing translation and resolves on both SSR and client
  navigation, while post/page/category/tag titles remain author content.
- Adding a message means editing four files (the English baseline plus its three
  translations, in whichever namespace the message belongs to), and `tsc`
  enforces it; ICU structural drift fails the catalog test, not a runtime
  render.
- The four catalogs cost bundle size only on the server; the client pays for
  exactly one locale.
- `zh-HK`/`zh-TW` terminology is now a maintenance commitment: no automated
  conversion will paper over a missing translation.
- The follow-the-locale default is a **visible change for fresh installs only**
  (`2026-11-08 14:30` → `2026/11/8 14:30` under `zh-CN`); upgraded installs are
  untouched by construction.
- **Errors are translated server-side.** Production code throws `DomainError` /
  `ActionFailure` with an `ErrorMessageDescriptor` (`{ messageKey, params,
  fallbackMessage }`); the Hono/oRPC boundaries translate the top-level message
  and every issue per request locale, and `ORPCError.data` / the Hono JSON body
  carry the same descriptor. Raw strings survive only as the documented
  passthrough for un-migrated technical output.
- **Notifications persist a descriptor.** A system (`admin`-kind) notification
  stores its creation-time English fallback plus nullable
  `title_key`/`title_params` and `body_key`/`body_params`; inbox, thread and the
  notification email resolve the same message through
  `domains/notifications/message.ts` with the reader/send locale and fall back
  to the stored text (one logged warning per key) when a key disappears.
  `direct`/`broadcast` rows keep the user's original text and no descriptor.
  `notification.*` keys are append-only.
- **Feed, calendar and manifest are revalidated representations.** Their cache
  entries are keyed by `locale:APP_VERSION:<content key>` (the calendar also
  keeps the theme variant), and their HTTP responses are
  `Cache-Control: public, no-cache` with an ETag computed over the exact served
  bytes. A conditional request gets a `304` with the current
  `Content-Language`/`ETag`, never a stale language. Saving the General section
  clears the whole `feed` and `calendar` buckets (all locale variants) through
  the existing `clear(db, bucket)` seam — no generation counters.
- **The locale switch is a flushed, ordered flow.** The General language
  Select is the one control that does not save immediately: its upstream
  handler awaits `flushAllAndWait()` (every registered settings card reports a
  boolean "clean" result), only then commits `field.onChange(newLocale)` and
  `save('locale')`, and reloads exactly once when the stored locale actually
  changed. A failed validation/commit vetoes the switch, preserves the dirty
  input and never reloads; per-card saves are serialized so a stale response
  cannot advance a newer baseline.
- **Calendar and fonts follow the locale.** Month/weekday/lunar/宜 labels come
  from hand-reviewed static tables (`render/calendar/locale.ts`; en-US renders
  neither lunar nor 宜), and the default font chains branch through CSS
  `:lang()` with the same map root.tsx prepends custom families to.
- **Release instrumentation.** `kobato --smoke-intl` (`server/infra/intl-probe.ts`)
  proves the executable's bundled ICU data: `supportedLocalesOf` on every Intl
  constructor used, plus real `DateTimeFormat` / `RelativeTimeFormat` /
  `DisplayNames` / `PluralRules` output for all four locales — run by
  `sea:smoke` in both managed and service-free modes. The e2e suite adds a
  real-HTTP four-locale journey: switch the language through the admin RPC,
  assert HTML/feed/Atom/manifest/calendar representations, prove a stale
  `If-None-Match` never answers `304` in the old language, and restore `zh-CN`
  for the shared instance.

## Alternatives considered

- **Simplified→Traditional conversion for `zh-HK`/`zh-TW`.** Rejected: it
  produces wrong terminology and un-reviewed wording; both locales are
  hand-written.
- **`Accept-Language` negotiation or `/en/` URL prefixes.** Rejected for v1: a
  single global UI locale keeps every public URL, feed URL and cache key stable.
- **JSON catalogs read at runtime.** Rejected: the SEA binary has no runtime
  message files.
- **A `system.*` migration flag.** Rejected: the rewrite is one row and
  idempotent; a flag would only add a second source of truth.
- **Making `timeFormat` required with a sentinel value.** Rejected: a sentinel
  inside a user-editable free-form string is indistinguishable from a real
  pattern.
