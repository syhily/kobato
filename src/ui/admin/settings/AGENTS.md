# Settings conventions

`/admin/settings` saves per-card via `useSettingsCard` backed by `useSettingsMutation.commit(section, payload)`. The save model is **blur-driven** — typing never fires a request. The save response is authoritative without a refetch: the card adopts it for display (`display`), while the form baseline advances to the values it submitted — never to the response (see the sparse-commit contract below).

Controls trigger saves differently:

| Control                       | Trigger       | When it fires                                                                 |
| ----------------------------- | ------------- | ----------------------------------------------------------------------------- |
| Text `<Input>` / `<Textarea>` | `flushOnBlur` | Input loses focus; no-op if clean                                             |
| Switch / Select / Combobox    | `save`        | `onChange`, immediately (after awaiting the upstream guard)                   |
| **General locale `Select`**   | `save`        | **The one exception** — see below: flush every dirty card, THEN commit locale |
| List append/remove/move       | none          | Relies on the next blur or a flush                                            |

Framework-level flushes (close, ESC, scroll-away, page hide) call every registered card via `SettingsFlushProvider`. `flushAll` / `flushSection` are fire-and-forget; `flushAllAndWait()` is the awaitable variant and resolves `true` only when EVERY card is clean (each card flush resolves a boolean — validation failure, rejected commit and exceptions are `false`).

### Failure semantics

- A whole-card commit (`flushOnBlur`, panel flush) that fails validation KEEPS the dirty input and its error on screen. It never resets the form to the last committed snapshot — that silently swallows the admin's draft (and, because clicking a select blurs the input first, would let a locale switch sail through).
- A field-scoped commit (`save(field)` from a switch/select/combobox) that the server rejects rolls THAT control back to its committed baseline, so an unpersisted value never renders as saved nor rides a later whole-card flush. If the admin edited the same field while the request was in flight, the newer input wins.
- A rejected whole-card commit stays dirty for the next flush; failed commits are never silent (toast + RHF field errors).

### Guard contract

`SettingsSelect` / `SettingsCombobox` await an upstream `onValueChange` guard before `save(name)`. The guard returns the explicit `SETTINGS_SKIP_COMMIT` verdict (`{ commit: false }`, from `shell/settings-change-verdict.ts`) to veto the change or to own the commit; returning nothing lets the wrapper save. A plain boolean cannot carry this contract: RHF's `field.onChange` is async and can itself resolve to `false` (its internal `state.next` result), which must not be read as a veto — pinned by the avatar-card field-scoped test.

### Locale switch

The General language selector is the sole transactional save, owned by `useLocaleSwitch` (not by a card's `onSaved`):

1. `await flushAllAndWait()` — EVERY dirty card must commit. Any failure vetoes the switch with the unsaved input/errors intact.
2. The locale field is committed by an explicit `save('locale')` only.
3. `broadcast(locale)` announces the change to peer tabs.
4. One `window.location.reload()` after that commit succeeds. A reload is never triggered by an ordinary flush or `onSaved`, so it cannot interrupt sibling saves and cannot persist a stale locale from an earlier failed attempt.

A failed locale commit rolls the select back to the committed language; the next pick starts a fresh transaction that can only persist the NEW value. While the transaction runs the locale select is `disabled` with `aria-busy`, and re-entry is ignored, so a second pick cannot start a parallel flush/commit chain.

The whole switch runs inside `SettingsFlushProvider.runTransaction`, which flips `isTransactionPending`. `SettingsPanel` applies `inert` + `aria-busy` to the ENTIRE workspace for that window, so no control on any card can be edited between the first flush and the reload — the reload can never drop input typed on another card. The flag clears on failure too; the provider then restores focus, deferring one frame so the card's own switching state has re-enabled the control. The locale switch passes the `SelectTrigger` ref as an explicit focus anchor: the picked option lives in a portal and unmounts, so the active-element fallback would point at a disconnected node. Without an explicit anchor the provider keeps the historic active-element behavior; an anchor from a just-finished transaction that has not been consumed yet is preserved only when the next transaction omits its anchor — an explicit anchor (including `null`, which means "no anchor") always wins. Running a transaction without the provider still executes it but logs a warning (the workspace cannot be made inert) — card-level tests are the only sanctioned no-provider use.

The language selector is released (`I18N_SETTINGS_ENABLED = true`), so this flow is what every admin sees; a new general card must register through `useSettingsCard` (the flush registry) or the switch would reload with its unsaved edits.

### Cross-tab locale sync

The locale lives in the shared `general` section, so a tab left open would keep rendering the old language (and could push it back on its next save — the reason whole-card commits are sparse). The subscription lives at the ROOT (`src/ui/lib/LocaleSyncProvider`, mounted by `src/root.tsx`), so every open document follows it — settings, the editor, analytics, public pages. `useLocaleSyncPublish()` is the card-side half:

- **Sender** — the switch calls the root publisher exactly once after the server acknowledged the locale, immediately before this tab's single reload. Every document gets a per-mount `origin` id (the provider's `createLocaleSyncOrigin`), so the sender ignores its own echo (a `BroadcastChannel` also delivers to other channel objects in the same document). The announcement carries the bootstrap settings `revision` as an opaque dedupe token.
- **Receiver** — a settings workspace registers its flush host (`SettingsFlushProvider` → `runTransaction` + `flushAllAndWait`). The provider runs the SAME transaction shape as a local switch: `flushAllAndWait()`, then one automatic `reload()` — only after the flush succeeded. It NEVER commits the locale (the sender already persisted it) and never re-publishes, so there is no broadcast loop.
- **Documents without a flush host** — the editor, the comment composer, `/admin/setup`, analytics and public pages hold input the app cannot inspect. They are NEVER reloaded automatically; a localized `role="alert"` notice offers an explicit Reload action, so an unsaved draft is never destroyed behind the user's back.
- **Failure** — a validation failure or rejected commit skips the reload; the dirty input stays on screen, the provider clears `inert`, and the notice offers Retry (flush again, then reload) and an explicit Reload. The announcement is not consumed on failure, so retry and a later repeat still run; the `revision` token is consumed only immediately before a reload attempt.
- **Ignored announcements** — the locale already loaded (nothing to apply), the same `revision` token already consumed by a reload attempt (a third tab's repeat), a repeat while a notice for the same announcement is open (no stacked alerts), an announcement while the workspace is `isTransactionPending` (a local switch is mid-flight; reloading would drop it), and repeats while a sync is already running.
- **No `BroadcastChannel`** (older Safari, blocked policy, sandboxed iframe) — publish/subscribe degrade to no-ops: the sender still reloads once, peers just pick the locale up on their next navigation. Never a throw.

Regression coverage: `tests/unit/ui/admin/settings/general-locale-sync.test.tsx` renders two real `GeneralForm` workspaces (each with the root `LocaleSyncProvider`) against one fake settings server (deep-merged through `mergeSectionPatch`) and asserts the persisted state, not only call arguments; `tests/unit/ui/lib/locale-sync-provider.test.tsx` pins the no-host editor-unsaved semantics, the flush failure/retry path, the dedupe rules and the notice.

## Adding a settings card

1. Use `useSettingsCard()` — destructure `flushOnBlur` for text inputs, `save` for switches/selects.
2. Text inputs: render through `<SettingsInput flushOnBlur={flushOnBlur} {...form.register('x')}>` — never bare `<Input>`. Multi-line: `<SettingsTextarea>`; secrets: `<SettingsSecretInput>`.
3. Switch/select/combobox: render through the wrapper components in `src/ui/admin/settings/shell/` with `save={save}` — never hand-roll `onValueChange`. A guard that vetoes or commits the field itself returns `SETTINGS_SKIP_COMMIT`.
4. List buttons MUST NOT call `save()` — let the next blur/flush commit the whole list.
5. `useSettingsCard` re-seeds the form only when clean and `toState(source)` differs from current form values — prevents lost edits and focus drops.

Each card POSTs a SPARSE Section patch: `sparseDiff(fromState(lastCommitted), fromState(submitted))`, so only owned fields whose mapped value actually moved are sent. A card shares its section with sibling cards and with other tabs — re-sending an untouched field would write this tab's stale copy over a value someone else has changed (the timezone card dragging the site locale along). The server deep-merges, validates, and writes only that row. `src/shared/config/merge-section-patch.ts` is the single merge implementation.

## Sparse whole-card commit (baseline contract)

`commitWhole` (blur flush, panel flush) diffs against `lastCommitted`:

- An empty diff POSTs nothing and still advances the baseline to the captured raw values — otherwise a `fromState` normalization (trim) would leave the card permanently dirty and every flush would retry.
- On success the baseline advances to the CAPTURED submitted raw values — never to the response, and never to a late `getValues()`. So (a) input typed during the round trip stays dirty and rides the next flush, and (b) a response field this card did not submit (another tab's locale) never enters this form or its baseline. `display` still adopts the response, but `display` is read-only.
- A rejected or validation-failed commit leaves the form and baseline untouched, so the retry re-computes the same honest diff.
- A field-scoped commit (`save(name)`) keeps its own contract: sparse for that one field, baseline advances only for that field, and a rejected value rolls just that control back.

## Copy

Every interface string on this surface — card titles, hints, validation errors, toasts, dialog
buttons — is a UI message id under `admin.settings.*`, resolved with `useI18n()`; never a Chinese
literal fallback. `secretFieldStrings({ t, … })` takes the card's translator because its configured
hint is a catalog message. Shared validation schemas (`shared/config/rate-limit-bucket`, the general
write schema) put typed `UiMessageId`s in Zod `message` slots, never prose: `useSettingsCard`
localizes them before building the RHF error tree (`localizeMessage`, interpolating the params from
the shared `zodIssueParams` — numeric `{min}`/`{max}` bounds merged with a custom issue's primitive
`params` bag, `{label}` included), and the server maps the same ids into wire descriptors
(`server/infra/http/error-descriptor`, same extractor). `localizeMessage` formats only catalog ids
through react-intl; a missing param or unformattable template logs and falls back to a generic
localized sentence — never a token name, the raw ICU template, or the message id. The assets and security
sections carry their custom messages as `assetsValidationMessages` / `securityValidationMessages`;
a strict patch with unknown keys rejects with the `admin.settings.errors.unrecognizedKeys`
descriptor (one issue per key, full key list in `params.keys`, field path preserved). The backup
restore prompt retries on `apiErrorDescriptorKey(error) === 'backup.error.passwordWrong'` — never a
localized-sentence match. Technical values (protocol names, URLs, paths,
database column names) stay as-is.
