# Settings conventions

`/admin/settings` saves per card through `useSettingsCard` → `useSettingsMutation.commit(section, payload)`. Saves are blur-driven — typing never fires a request. The save response is authoritative without a refetch: the card adopts it for display (`display`), while the form baseline advances to the values it submitted, never to the response.

- Text `<Input>` / `<Textarea>` — `flushOnBlur` on blur; no-op if clean.
- Switch / Select / Combobox — `save` on `onChange`, immediately (after awaiting the upstream guard).
- General locale `Select` — `save`, but flushes every dirty card first, THEN commits the locale.
- List append/remove/move — no trigger; relies on the next blur or a flush.

Framework flushes (close, ESC, scroll-away, page hide) call every registered card via `SettingsFlushProvider`. `flushAll` / `flushSection` are fire-and-forget; `flushAllAndWait()` is awaitable and resolves `true` only when EVERY card is clean (each card flush resolves a boolean — validation failure, rejected commit and exceptions are `false`).

## Commit and validation contract

- A failing whole-card commit (`flushOnBlur`, panel flush) KEEPS the dirty input and its error on screen and never resets the form to the last committed snapshot; it stays dirty for the next flush, and failures are never silent (toast + RHF field errors).
- A rejected field-scoped commit (`save(field)` from a switch/select/combobox) rolls THAT control back to its committed baseline, so an unpersisted value never renders as saved nor rides a later whole-card flush. An edit made in flight wins.
- `SettingsSelect` / `SettingsCombobox` await an upstream `onValueChange` guard before `save(name)`. It returns `SETTINGS_SKIP_COMMIT` (`{ commit: false }`, `shell/settings-change-verdict.ts`) to veto or own the commit; returning nothing lets the wrapper save. A plain boolean cannot carry this — RHF's async `field.onChange` can resolve to `false` (its `state.next`), which is not a veto (pinned by the avatar-card field-scoped test).

`commitWhole` (blur flush, panel flush) diffs against `lastCommitted`:

- An empty diff POSTs nothing and still advances the baseline to the captured raw values (a `fromState` normalization such as trim must not leave the card permanently dirty).
- On success the baseline advances to the CAPTURED submitted raw values — never to the response, never to a late `getValues()` — so input typed during the round trip stays dirty and a response field this card did not submit never enters the form. `display` adopts the response but is read-only.
- A rejected or validation-failed commit leaves form and baseline untouched, so the retry recomputes the same honest diff; `save(name)` is sparse for its one field and advances the baseline only for it.

## Locale switch

The General language selector (`I18N_SETTINGS_ENABLED = true`) is the sole transactional save, owned by `useLocaleSwitch` (not by a card's `onSaved`). Every general card must register through `useSettingsCard` (the flush registry), or the switch reloads with its unsaved edits.

1. `await flushAllAndWait()` — EVERY dirty card must commit; any failure vetoes the switch with the unsaved input/errors intact.
2. The locale field is committed by an explicit `save('locale')` only; `broadcast(locale)` then announces it to peer tabs.
3. One `window.location.reload()` after that commit succeeds — never from an ordinary flush or `onSaved`.

A failed locale commit rolls the select back to the committed language; the next pick starts a fresh transaction that can only persist the NEW value. While it runs the select is `disabled` with `aria-busy`, and re-entry is ignored. The switch runs inside `SettingsFlushProvider.runTransaction`, which flips `isTransactionPending`; `SettingsPanel` applies `inert` + `aria-busy` to the ENTIRE workspace for that window, and the flag clears on failure too (the provider then restores focus one frame later, so the card's switching state has re-enabled the control). The switch passes the `SelectTrigger` ref as an explicit focus anchor — the picked option lives in a portal and unmounts; an unconsumed anchor survives only when the next transaction omits its anchor, and an explicit anchor (including `null` = "no anchor") always wins. Running a transaction without the provider executes but logs a warning; card-level tests are the only sanctioned no-provider use.

## Cross-tab locale sync

Settings-side half only — the root loop and per-document capability rules live in `../AGENTS.md` (`src/ui/lib/LocaleSyncProvider`, mounted by `src/root.tsx`); the cards use `useLocaleSyncPublish()`. Pinned by `tests/unit/ui/admin/settings/general-locale-sync.test.tsx` (two real `GeneralForm` workspaces against one fake server, asserting persisted state) and `tests/unit/ui/lib/locale-sync-provider.test.tsx` (no-host semantics, failure/retry, dedupe, notice).

- Sender — publishes once after the server acknowledged the locale, immediately before this tab's single reload; a per-mount `createLocaleSyncOrigin` id drops its own echo (`BroadcastChannel` also delivers to other channel objects in the same document) and the bootstrap settings `revision` rides along as the dedupe token.
- Receiver — the workspace flush host (`SettingsFlushProvider` → `runTransaction` + `flushAllAndWait`) runs the SAME transaction shape as a local switch, then one automatic `reload()` only after the flush succeeded. It NEVER commits the locale and never re-publishes.
- Failure / ignored — a validation failure or rejected commit skips the reload, keeps the dirty input, clears `inert`, and offers Retry (flush again, then reload) plus an explicit Reload; the `revision` token is consumed only immediately before a reload attempt. An announcement is ignored when the locale is already loaded, its `revision` was consumed, a notice for it is open, the workspace is `isTransactionPending`, or a sync is running. Without `BroadcastChannel` publish/subscribe are no-ops (never a throw); the sender still reloads once.

## Adding a settings card

1. `useSettingsCard()` — `flushOnBlur` for text inputs, `save` for switches/selects.
2. Text inputs render through `<SettingsInput flushOnBlur={flushOnBlur} {...form.register('x')}>` — never bare `<Input>`. Multi-line: `<SettingsTextarea>`; secrets: `<SettingsSecretInput>`.
3. Switch/select/combobox render through the wrappers in `src/ui/admin/settings/shell/` with `save={save}` — never hand-roll `onValueChange`; a guard that vetoes or commits the field itself returns `SETTINGS_SKIP_COMMIT`.
4. List buttons MUST NOT call `save()` — let the next blur/flush commit the whole list.
5. Each card POSTs a SPARSE Section patch, `sparseDiff(fromState(lastCommitted), fromState(submitted))` — only owned fields whose mapped value moved. The card shares its section with sibling cards and other tabs, so re-sending an untouched field would write a stale copy over someone else's change. The server deep-merges, validates, and writes only that row; `src/shared/config/merge-section-patch.ts` is the single merge implementation. `useSettingsCard` re-seeds the form only when clean and `toState(source)` differs from the current values.

## Copy

- Every interface string here (card titles, hints, validation errors, toasts, dialog buttons) is a UI message id under `admin.settings.*`, resolved with `useI18n()`; never a Chinese literal fallback. `secretFieldStrings({ t, … })` takes the card's translator because its configured hint is a catalog message.
- Shared validation schemas (`shared/config/rate-limit-bucket`, the general write schema) put typed `UiMessageId`s in Zod `message` slots, never prose. `useSettingsCard` localizes them via `localizeMessage`, interpolating params from the shared `zodIssueParams` (numeric `{min}`/`{max}` bounds merged with a custom issue's primitive `params` bag, `{label}` included); the server maps the same ids through `server/infra/http/error-descriptor`. `localizeMessage` formats only catalog ids — a missing param or unformattable template logs and falls back to a generic localized sentence, never a token name, the raw ICU template, or the message id.
- The assets and security sections carry custom messages as `assetsValidationMessages` / `securityValidationMessages`. A strict patch with unknown keys rejects with the `admin.settings.errors.unrecognizedKeys` descriptor (one issue per key, the full key list in `params.keys`, field path preserved).
- The backup restore prompt retries on `apiErrorDescriptorKey(error) === 'backup.error.passwordWrong'`, never a localized-sentence match. Technical values (protocol names, URLs, paths, database column names) stay as-is.
