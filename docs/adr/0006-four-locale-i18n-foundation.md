# ADR-0006: Four-locale i18n — one global UI locale, typed ICU catalogs, follow-the-locale dates

- Status: accepted
- Date: 2026-11-08

## Context

Kobato stored `siteIdentity.locale`, `timeZone` and `timeFormat` and emitted `<html lang>`, but the locale drove nothing: UI copy, validation
messages, errors, emails, feeds and dates were hardcoded Chinese, `locale` accepted any BCP 47 string, and `timeFormat` was a required
free-form pattern.

- **Stored `locale` is untrusted legacy data.** Rows may carry `zh`, `zh-Hans-CN`, `zh-Hant-HK` or arbitrary tags. Hydration drops a section
  whose row fails its schema and a missing `siteIdentity` reads as _not installed_, so one odd tag could brick an installed blog.
- **`timeFormat` cannot distinguish "default" from "pinned".** Every stored row has a value (the install seed wrote `yyyy-LL-dd HH:mm`).
- **Messages must ship inside the SEA binary.** Catalogs are TypeScript modules in the server bundle, never JSON read at runtime; the client
  receives only the current locale's catalog and labels.

## Decision

**A closed locale set, canonicalized on every seam.** `en-US`, `zh-HK`, `zh-TW`, `zh-CN` (`src/shared/i18n/locales.ts`). Tags are used
verbatim for HTML `lang`, `Content-Language`, RSS `language` and Atom `xml:lang`; only `og:locale` maps to the underscore spelling. The read
schema canonicalizes documented aliases (`zh`, `zh-Hans-CN`, `zh-Hant-TW`, case-insensitive, `_` as `-`) and falls back to `zh-CN` for
anything unknown, so a legacy value can never fail hydration. A one-time, idempotent boot pass
(`src/server/domains/settings/services/locale-migration.ts`) rewrites the stored value before the snapshot is built; no `system.*` flag row,
because a canonical value performs zero writes.

**`zh-HK` and `zh-TW` are independent, hand-reviewed Traditional Chinese catalogs.** No Simplified ↔ Traditional conversion at build time,
runtime, or in batch scripts — OpenCC and character-level mappings are forbidden — and no machine translation to fill keys. No fallback chain
connects the two: a missing key falls back to the English baseline, a missing-translation signal, not a regional strategy. Identical wording
is often correct and must not be recast just to differ. The one exception is the calendar's lunar/宜 terminology (below).

**English is the catalog baseline; every locale is type-checked against it.** `messages/ui/en-US.ts` and `messages/server/en-US.ts` define
`UiMessageId` / `ServerMessageId`; the other three use `satisfies`, so a missing or extra key fails `tsc`. `src/shared/i18n/catalog.ts` merges
each locale over the English baseline per namespace and validates the ICU contract: identical argument names and kinds
(plain/plural/select/number/date/time/rich-text tag); placeholders and skeletons (`{name}`, `{count, plural, …}`, `<tag>…</tag>`) verbatim,
only branch text translated and keys never translated; plural categories legal for the locale's `Intl.PluralRules` (English one/other, Chinese
other-only) with `other` present; select options covering the baseline's values. Violations throw; `shared/` has no logger, so the root-loader
and server translator boundaries catch, log and degrade.

**One ICU engine, two surfaces.** The server formats through react-intl's `createIntl` (`src/server/infra/i18n.ts`), the client through
`IntlProvider` — no second implementation. Server translators are cached per immutable locale, never per request: no module-level "current
locale" exists, so background jobs, emails and notifications resolve the locale explicitly.

**Bundle boundary.** `messages/ui/**`, `messages/server/**`, `inkling-labels/**` and `catalog.ts` are server-side value imports. The client
receives one locale's UI catalog AND its matching Inkling label overlay from the root loader (`content.bootstrap` → `i18n: { locale, messages,
inklingLabels }`); the editor gets the overlay from loader data and never value-imports the label tables.
`src/shared/i18n/fallback-messages.ts` is the single sanctioned exception: duplicated from the Simplified Chinese catalog (parity pinned by
test), it holds the root ErrorBoundary copy plus the no-payload meta fallbacks (pre-install title, page `article:section`). It is the only
language source when no `i18n` payload exists; meta never emits an empty section or its own literal.

**One provider, meta reads matches.** The root `Layout` owns the only react-intl provider, fed from the loader payload (falling back to
`fallback-messages` on root-loader failure, which renders the minimal `ErrorView`, never public chrome). Route `meta()` re-runs on client
navigation, so static titles are message ids resolved from the root match's payload (`i18nFromMatches`), never from settings or a server
translator; content titles stay raw. `og:locale` maps through `toOpenGraphLocale`; `article:section` is catalog copy.

**`timeFormat: string | null`.** `null` means "follow the locale" and renders through `Intl.DateTimeFormat` (`dateStyle`/`timeStyle`: short)
in the site time zone; any string stays a custom pattern substituted token-by-token (never handed to date-fns). Every stored value — including
the old install seed — is preserved as custom, so upgrading changes no site's display, while a fresh install follows the locale.

**Content language is not a fifth locale.** A post/page may carry an optional `contentLanguage`: any well-formed BCP 47 tag, canonicalized on
write through `Intl.getCanonicalLocales`, `null` when unset (`src/shared/i18n/content-language.ts` owns the grammar; `resolveContentLanguage`
in the content meta schema owns reject-with-descriptor). It is author metadata: the public detail body container stamps it as `lang`, an unset
value emits no attribute so the body inherits the UI locale, and it never selects a catalog, changes a title/body/feed URL, or triggers
detection/translation. The editor control is one optional text field with label/hint/error in all four catalogs; a malformed tag rejects with
the `admin.editor.contentLanguage.error` descriptor plus the `contentLanguage` issue path, because oRPC input-schema failures never reach the
descriptor channel.

**Errors are translated server-side.** Production code throws `DomainError` / `ActionFailure` with an `ErrorMessageDescriptor` (`{ messageKey,
params, fallbackMessage }`); the Hono/oRPC boundaries translate the top-level message and every issue per request locale, and `ORPCError.data`
/ the Hono JSON body carry the same descriptor. Raw strings survive only as the documented passthrough for un-migrated technical output.

**Notifications persist a descriptor.** A system (`admin`-kind) notification stores its creation-time English fallback plus nullable
`title_key`/`title_params` and `body_key`/`body_params`; inbox, thread and email resolve the message through
`src/server/domains/notifications/message.ts` with the reader/send locale, falling back to the stored text (one logged warning per key) when a
key disappears. `direct`/`broadcast` rows keep the user's text and no descriptor. `notification.*` keys are append-only. Params persist as
plain-text JSON (`JSON.stringify`) validated for JSON semantics only (finite numbers, plain objects/arrays, no cycles) — never an HTML
contract: `Unexpected token '<'` or a literal `<script>` is legitimate data, stored as-is, and every read path escapes it as text; nested
objects are inert to ICU (only scalar params are formatted).

**Settings-derived caches and representations.** `feed`/`calendar` entries key on `locale:APP_VERSION:settingsRevision:<content key>`
(calendar keeps the theme variant); `og` on `settingsRevision:<slug>-<input hash>`; the manifest has NO server-side cache entry. Feed,
calendar and manifest send `Cache-Control: public, no-cache` with an ETag over the exact served bytes (hand-built manifest JSON included) plus
`Content-Language`; a conditional request gets a `304` carrying the current `Content-Language`/`ETag`, never a stale language. The
process-unique `revision` (`<bootId>:<counter>`, `src/shared/config/snapshot.ts`) is only the request-identity / locale-sync token; cache keys
use the SECTION-SCOPED `AppLocalization.revisions` (`src/shared/config/representation-scopes.ts`) — one content-addressed hash (stable
serialization + pure FNV-1a, encrypted secrets excluded) per representation over exactly its sections: `feed` (identity/content/branding),
`calendar` (identity/quote/fonts), `og` (identity/SEO/fonts), `manifest` (identity/branding), `sitemap` (site origin), `comments` (comment
settings), and the shared `detail`/`listing` shell (identity, assets, navigation, socials, content, sidebar, comments, webmentions, SEO,
fonts). A save orphans only its scope (security/backup/mail/limits moves nothing); the same settings reuse the same keys across restarts. The
request context pins bundle and revisions in ONE lazy capture. `general`/`content`/`assets`/`sidebar`/`fonts`/`comments` saves also call the
strict, synchronous `clearLocalizedOutputs(getDb())` purely to RECLAIM storage (`feed`, `calendar`, `og`, `comments`, `sitemap`); correctness
never depends on the delete and there is no in-flight drain — a render started before the save writes only its own old-generation key. A
delete failure propagates into `admin.settings.warnings.sectionChangeFailed`. No generation counters.

**Pure `/rpc/*` requests hydrate settings before the perimeter reads them.** The API mount hydrates the snapshot ahead of the dynamic
body-limit resolver and the CSRF guard, because both read settings (the live request-size cap; `security.csrf.enabled` / `exemptPaths`) and
the localized rejection copy — a cold process must never answer with pre-hydration defaults (`zh-CN`, the built-in 10 MB cap, CSRF on). The
later `HandlerContext` projection reuses the same single-flight snapshot, so `context.settings` and `context.localization` come from one
capture.

**The locale switch is a flushed, ordered, whole-panel transaction.** The General language `Select` is the one control that does not save
immediately: its handler runs inside `SettingsFlushProvider.runTransaction`, awaits `flushAllAndWait()` (every registered card reports a
boolean "clean" result), then commits `field.onChange(newLocale)` and `save('locale')`, and reloads exactly once when the stored locale
actually changed. For the flush → commit → reload window the WHOLE settings workspace is `inert` + `aria-busy` (`SettingsPanel`), not just the
locale control, so no other card can be edited and the reload cannot drop its input. A failed validation/commit vetoes the switch, clears the
transaction flag, preserves dirty input and never reloads; per-card saves are serialized so a stale response cannot advance a newer baseline.
The provider restores focus; the switch passes an explicit anchor (the `SelectTrigger`) because the clicked option unmounts with its portal,
falling back to the active element otherwise. A transaction without the provider runs but logs a warning — the workspace cannot be made inert.

**Calendar and fonts follow the locale.** Month/weekday/lunar/宜 labels come from hand-reviewed static tables
(`src/server/render/calendar/locale.ts`; en-US renders neither lunar nor 宜). `zh-HK` and `zh-TW` share ONE hand-reviewed Traditional table for
the calendar image (lunar names and the 宜 term map); no runtime Simplified→Traditional conversion and no fallback chain. This sharing is
calendar-specific — the two locales' UI catalogs remain independent. Default font chains branch through CSS `:lang()` with the same map
`root.tsx` prepends custom families to.

**`I18N_SETTINGS_ENABLED` is `true`.** The General settings card exposes the language selector to every admin. Locale writes were always
constrained to the closed set, so the switch is a UI exposure, not a data migration; changing the language reloads once every dirty settings
card has been saved (see the flush flow above).

**A scanner, not a grep.** `tests/_helpers/i18n-literals.ts` walks the AST for JSX text, `aria-label`/`placeholder`/`title`/`alt`,
`titleMeta()` arguments, toast and `DomainError` copy, locale-less `toLocale*()` calls, hardcoded locale literals, and plain/template literals
containing Han characters (interpolated templates included — `第 ${n} 页` is still copy). Scope is the whole production tree (`src/**`). The
allowlist is exact — file, rule and (where applicable) snippet, each with a written reason — and covers only non-copy data and protocol values
(locale identity tables, the pinyin transliteration map, Inkling glyphs and the emoji-mart locale id, developer invariants, third-party/widget
protocol parameters).

**Release instrumentation.** `kobato --smoke-intl` (`src/server/infra/intl-probe.ts`) proves the executable's bundled ICU data:
`supportedLocalesOf` on every Intl constructor used, plus real formatter output (`formatDuration` included) for all four locales — run by
`sea:smoke` in both managed and service-free modes. The e2e suite adds a real-HTTP four-locale journey: switch the language through the admin
RPC, assert HTML/feed/Atom/manifest/calendar representations, prove a stale `If-None-Match` never answers `304` in the old language, and
restore `zh-CN`.

## Consequences

- Locale can never make an installed site read as uninstalled; the alias rewrite is safe to re-run on every boot. Existing sites keep their
  date display exactly; fresh installs follow the locale without admin action (`2026-11-08 14:30` → `2026/11/8 14:30` under `zh-CN`);
  upgrades are untouched by construction.
- Static route titles are message ids: `titleMeta('meta.title.…')` fails `tsc` when a translation is missing and resolves on SSR and client
  navigation; post/page/category/tag titles stay author content. Adding a message means editing four files in its namespace, enforced by
  `tsc`; ICU drift fails the catalog test, not render. Only the server pays for four catalogs; the client pays for one locale.
- `zh-HK`/`zh-TW` terminology is a standing maintenance commitment: no conversion papers over a missing translation, and identical wording
  is acceptable.
- `contentLanguage` is per-entity author data, nullable (`content_language`, no backfill), carried through backup/restore with the database
  file, rendered ONLY as the body container's `lang`; the four UI locales, the switch and every URL stay unchanged.
- Terminology baseline and anchors: `docs/i18n/glossary.md`; acceptance matrix and review boundary: `docs/i18n/acceptance.md`; read-only
  HK/TW difference report: `scripts/i18n/regional-diff.ts` (`pnpm exec vite-node scripts/i18n/regional-diff.ts --keys`); representative
  terms pinned by `tests/unit/shared/i18n/glossary.test.ts`, which does not freeze every natural difference and does not require `zh-HK` and
  `zh-TW` to differ.

## Alternatives considered

Rejected: Simplified→Traditional conversion for `zh-HK`/`zh-TW` (wrong terminology and un-reviewed wording; both locales are hand-written,
with the calendar table as the only shared artifact); `Accept-Language` negotiation or `/en/` URL prefixes (a single global UI locale keeps
every public URL, feed URL and cache key stable); JSON catalogs read at runtime (the SEA binary has no runtime message files); a `system.*`
migration flag (the rewrite is one row and idempotent; a flag adds a second source of truth); a required `timeFormat` sentinel
(indistinguishable from a real pattern).
