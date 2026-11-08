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
  catalog and Inkling label overlay reach the browser, through the root loader;
  server-only copy (email, notifications) never does.

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

`zh-HK` and `zh-TW` are independent, hand-reviewed UI catalogs. No
Simplified ↔ Traditional conversion runs at build or runtime, and no fallback
chain connects them. The one deliberate exception is the calendar renderer:
its lunar/宜 terminology uses a single hand-reviewed static traditional table
that both locales share (see below), while their UI catalogs stay independent.

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

**Bundle boundary.** `messages/ui/**`, `messages/server/**`,
`inkling-labels/**` and `catalog.ts` are server-side value imports: the client
receives one locale's UI catalog AND its matching Inkling label overlay from
the root loader (`content.bootstrap` →
`i18n: { locale, messages, inklingLabels }`). The editor gets the overlay from
loader data and never value-imports the label tables.
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
toast and `DomainError` copy, locale-less `toLocale*()` calls, hardcoded locale
literals, and plain/template literals containing Han characters (interpolated
templates included — `第 ${n} 页` is still copy). Its final scope is the
**whole production tree** (`src/**`, one root). The allowlist is exact — file,
rule and (where applicable) snippet, each with a written reason; it covers only
non-copy data and protocol values (locale identity tables, the pinyin
transliteration map, inkling glyphs and the emoji-mart locale id, developer
invariants, third-party/widget protocol parameters).

**Content language is not a fifth locale.** A post/page may carry an optional
`contentLanguage` — any well-formed BCP 47 tag, canonicalized on write through
`Intl.getCanonicalLocales`, `null` when unset (`src/shared/i18n/content-language.ts`
owns the grammar; `resolveContentLanguage` in the content meta schema owns the
reject-with-descriptor rule). It is author metadata for the prose: the public
detail body container stamps it as `lang`, an unset value renders no attribute
so the body inherits the document's UI locale, and it never selects a catalog,
changes a title/body/feed URL, or triggers detection/translation. The editor's
control is one optional text field with label/hint/error in all four catalogs;
the write API stays strict — a malformed tag rejects with the
`admin.editor.contentLanguage.error` descriptor plus the `contentLanguage`
issue path, because oRPC input-schema failures never reach the descriptor
channel.

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
- A page whose prose is not in the UI locale can say so without any new locale:
  `contentLanguage` is per-entity author data, stored nullable
  (`content_language`, no backfill), carried through backup/restore with the
  database file, and rendered ONLY as the body container's `lang`. The four UI
  locales, the UI-locale switch and every URL stay exactly as they were.
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
  `notification.*` keys are append-only. Params are persisted as plain-text JSON
  (`JSON.stringify`), and write-time validation enforces JSON semantics only
  (finite numbers, plain objects/arrays, no circular references) — never an
  HTML contract. An error such as `Unexpected token '<'` or a literal
  `<script>` is legitimate param data, stored as-is; every React/text read path
  escapes it as text, so HTML-shaped values never execute. Nested objects are
  inert to ICU at format time (only scalar params reach the formatter).
- **Feed, calendar and OG are settings-generation server-cache entries; feed,
  calendar and manifest are revalidated representations.** The `feed` and
  `calendar` buckets key their entries by
  `locale:APP_VERSION:settingsRevision:<content key>` (the calendar also keeps
  the theme variant); the `og` bucket keys by
  `settingsRevision:<slug>-<input hash>` because the card embeds the site
  title/summary/logo and the `seo.og` dimensions; the manifest has NO
  server-side cache entry. All three HTTP responses are
  `Cache-Control: public, no-cache` with an ETag computed over the exact served
  bytes (the manifest's hand-built JSON included) plus the current
  `Content-Language`. A conditional request gets a `304` with the current
  `Content-Language`/`ETag`, never a stale language.
  The process-unique `revision` (`<bootId>:<counter>`,
  `shared/config/snapshot.ts`) stays the request-identity / locale-sync token:
  the boot id is minted once per process, so a restart can never reproduce it.
  Cache keys use the SECTION-SCOPED `AppLocalization.revisions` instead
  (`shared/config/representation-scopes.ts`): one content-addressed hash per
  representation over exactly the sections it renders — `feed`
  (identity/content/branding), `calendar` (identity/quote/fonts), `og`
  (identity/SEO/fonts), `manifest` (identity/branding), `sitemap` (site
  origin), `comments` (comment settings) and the shared `detail`/`listing` page
  shell (identity, assets, navigation, socials, content, sidebar, comments,
  webmentions, SEO, fonts).
  Because the hash is over content (stable serialization + pure FNV-1a) and
  encrypted settings secrets are excluded, the same settings reuse the same
  keys across restarts and a credential rotation is not a representation
  change. A relevant save therefore
  orphans only that scope's keys: security/backup/mail/limits save does not
  move ANY representation, while locale/sidebar/content/assets/seo/fonts save
  moves exactly the scopes that render them. The request context pins the
  bundle and all scope revisions in ONE lazy capture, and every renderer takes
  its inputs from that same bundle. The `general`/`content`/`assets`/
  `sidebar`/`fonts`/`comments` handlers call the strict, synchronous
  `clearLocalizedOutputs(getDb())` purely to RECLAIM storage (`feed`,
  `calendar`, `og`, `comments`, `sitemap`) — correctness does not depend on the delete,
  and there is no in-flight drain: a render started before the save can only
  write its own old-generation key, which no request addresses any more. A
  delete failure propagates into the existing
  `admin.settings.warnings.sectionChangeFailed` save warning. Still no
  generation counters, and nothing to clear for the manifest.
- **Pure `/rpc/*` requests hydrate settings before the perimeter reads them.**
  The API mount hydrates the snapshot ahead of the dynamic body-limit resolver
  and the CSRF guard, because both read settings (the live request-size cap;
  `security.csrf.enabled` / `exemptPaths`) and the localized rejection copy —
  a cold process must never answer with the pre-hydration defaults (`zh-CN`,
  the built-in 10 MB cap, CSRF on). The later HandlerContext projection reuses
  the same single-flight snapshot, so `context.settings` and
  `context.localization` still come from one capture.
- **The locale switch is a flushed, ordered, whole-panel transaction.** The
  General language Select is the one control that does not save immediately:
  its upstream handler runs inside `SettingsFlushProvider.runTransaction`,
  awaits `flushAllAndWait()` (every registered settings card reports a boolean
  "clean" result), only then commits `field.onChange(newLocale)` and
  `save('locale')`, and reloads exactly once when the stored locale actually
  changed. For the entire flush → commit → reload window the WHOLE settings
  workspace is `inert` + `aria-busy` (`SettingsPanel`), not just the locale
  control, so no other card can be edited and the reload cannot drop input
  typed on another card. A failed validation/commit vetoes the switch, clears
  the transaction flag, preserves the dirty input and never reloads; per-card
  saves are serialized so a stale response cannot advance a newer baseline.
  The provider restores focus after the window, and the locale switch passes an
  explicit anchor (the `SelectTrigger`) because the clicked option lives in a
  portal and unmounts; the active-element fallback is only for transactions
  that omit an anchor. Running a transaction without the provider still
  executes it but logs a warning — the workspace cannot be made inert.
- **Calendar and fonts follow the locale.** Month/weekday/lunar/宜 labels come
  from hand-reviewed static tables (`render/calendar/locale.ts`; en-US renders
  neither lunar nor 宜). `zh-HK` and `zh-TW` share ONE hand-reviewed static
  traditional table for the calendar image (lunar names and the 宜 term map);
  there is no runtime Simplified→Traditional conversion and no fallback chain.
  This sharing is calendar-specific — the two locales' UI catalogs remain
  independent. The default font chains branch through CSS `:lang()` with the
  same map root.tsx prepends custom families to.
- **Release instrumentation.** `kobato --smoke-intl` (`server/infra/intl-probe.ts`)
  proves the executable's bundled ICU data: `supportedLocalesOf` on every Intl
  constructor used, plus real `DateTimeFormat` / `RelativeTimeFormat` /
  `DisplayNames` / `PluralRules` / `ListFormat` / `Collator` output and the
  production `formatDuration` result (NumberFormat units joined by ListFormat)
  for all four locales — run by `sea:smoke` in both managed and service-free
  modes. The e2e suite adds a
  real-HTTP four-locale journey: switch the language through the admin RPC,
  assert HTML/feed/Atom/manifest/calendar representations, prove a stale
  `If-None-Match` never answers `304` in the old language, and restore `zh-CN`
  for the shared instance.

## Governance artifacts

- Regional terminology baseline, the HK/TW decisions that must not be
  auto-converted, and the machine-readable anchor table:
  [`../i18n/glossary.md`](../i18n/glossary.md).
- Acceptance matrix, automated-vs-human review boundary, and the
  real-browser results template: [`../i18n/acceptance.md`](../i18n/acceptance.md).
- Read-only HK/TW difference report (never writes a catalog):
  `scripts/i18n/regional-diff.ts`, run with
  `pnpm exec vite-node scripts/i18n/regional-diff.ts --keys`.
- The representative terms are pinned by
  `tests/unit/shared/i18n/glossary.test.ts`; the test deliberately does not
  freeze the full natural-difference set and does not require `zh-HK` and
  `zh-TW` to differ.

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
