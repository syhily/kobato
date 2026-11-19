# Settings conventions

## Layout

Cross-section framework files stay at the root (`SettingsSection`, `SettingsHintTooltip`, `display`, `feature-flags`, `useSettingsMutation`, `use-locale-switch`, `gravatar-mirror-presets`). Every multi-card section owns a subdirectory: the entry form, one file per card (and per sortable row), and a kebab-case `model.ts`/`form-schema.ts`. A section stays at the root only while it is genuinely a single card (`AnalyticsForm`, `AssetsForm`, …). Sections: `general/`, `navigation/`, `sidebar/`, `security/`, `comments/`, `content/`, `backup/`, `mail/`, `observability/`, `storage/`, `cache/`, `rate-limit/`, `shell/` (workspace chrome, flush/search/scroll-spy controllers, form wrappers).

A new section with more than one file gets its own subdirectory; do not flatten cards back into the root.

`/admin/settings` saves per card through `useSettingsCard` → `useSettingsMutation.commit(section, payload)`. Saves are blur-driven — typing never fires a request. The save response is authoritative for display, while the form baseline advances to the values it submitted, never to the response.

- Text `<Input>` / `<Textarea>` — `flushOnBlur` on blur; no-op if clean.
- Switch / Select / Combobox — `save` on `onChange`, immediately (after awaiting the upstream guard).
- General locale `Select` — `save`, but flushes every dirty card first, THEN commits the locale.
- List append/remove/move — no trigger; relies on the next blur or a flush.

Framework flushes (close, ESC, scroll-away, page hide) call every registered card via `SettingsFlushProvider`. `flushAll` / `flushSection` are fire-and-forget; `flushAllAndWait()` is awaitable and resolves `true` only when EVERY card is clean.

`shell/SettingsWorkspace.tsx` owns the section registry + workspace shell; a route module only passes `bundle` / `timeZones` / `masks` / `onClose` and renders it.

## Commit and validation contract

- A failing whole-card commit KEEPS the dirty input and its error on screen and never resets the form; failures are never silent (toast + RHF field errors).
- A rejected field-scoped commit (`save(field)`) rolls THAT control back to its committed baseline, so an unpersisted value never renders as saved nor rides a later flush. An edit made in flight wins.
- `SettingsSelect` / `SettingsCombobox` await an upstream `onValueChange` guard before `save(name)`. It returns `SETTINGS_SKIP_COMMIT` (`{ commit: false }`, `shell/settings-change-verdict.ts`) to veto or own the commit; a plain boolean cannot carry this (RHF's async `field.onChange` can resolve to `false`, which is not a veto).

`commitWhole` (blur flush, panel flush) diffs against `lastCommitted`:

- An empty diff POSTs nothing and still advances the baseline to the captured raw values.
- On success the baseline advances to the CAPTURED submitted raw values — never to the response, never to a late `getValues()` — so input typed during the round trip stays dirty. `display` adopts the response but is read-only.
- A rejected or validation-failed commit leaves form and baseline untouched; `save(name)` is sparse for its one field and advances the baseline only for it.

## Locale switch

The General language selector is the sole transactional save, owned by `useLocaleSwitch` (not by a card's `onSaved`). Every general card must register through `useSettingsCard`, or the switch reloads with its unsaved edits.

1. `await flushAllAndWait()` — EVERY dirty card must commit; any failure vetoes the switch with the unsaved input/errors intact.
2. The locale field is committed by an explicit `save('locale')` only; `broadcast(locale)` then announces it to peer tabs.
3. One `window.location.reload()` after that commit succeeds — never from an ordinary flush or `onSaved`.

A failed locale commit rolls the select back to the committed language; while a transaction runs the select is `disabled` with `aria-busy` and re-entry is ignored. The switch runs inside `SettingsFlushProvider.runTransaction`, which flips `isTransactionPending`; `SettingsPanel` applies `inert` + `aria-busy` to the ENTIRE workspace for that window, and the flag clears on failure too. The switch passes the `SelectTrigger` ref as an explicit focus anchor (the picked option lives in a portal and unmounts). Running a transaction without the provider executes but logs a warning; card-level tests are the only sanctioned no-provider use.

## Cross-tab locale sync

Settings-side half only — the root loop and per-document capability rules live in the public leaf (`packages/web/public/AGENTS.md` → Structure, `ui/lib/LocaleSyncProvider`, mounted by `apps/kobato/src/root.tsx`); the cards use `useLocaleSyncPublish()`. Pinned by `packages/web/admin/tests/unit/ui/settings/general-locale-sync.test.tsx` and `packages/web/public/tests/unit/ui/lib/locale-sync-provider.test.tsx`.

- Sender — publishes once after the server acknowledged the locale, immediately before this tab's single reload; a per-mount origin id drops its own echo, and the bootstrap settings `revision` rides along as the dedupe token.
- Receiver — the workspace flush host runs the SAME transaction shape as a local switch, then one automatic `reload()` only after the flush succeeded. It NEVER commits the locale and never re-publishes.
- Failure / ignored — a validation failure or rejected commit skips the reload, keeps the dirty input, clears `inert`, and offers Retry plus an explicit Reload. An announcement is ignored when the locale is already loaded, its `revision` was consumed, a notice is open, the workspace is `isTransactionPending`, or a sync is running. Without `BroadcastChannel` publish/subscribe are no-ops; the sender still reloads once.

## Adding a settings card

1. `useSettingsCard()` — `flushOnBlur` for text inputs, `save` for switches/selects.
2. Text inputs render through `<SettingsInput flushOnBlur={flushOnBlur} {...form.register('x')}>` — never bare `<Input>`. Multi-line: `<SettingsTextarea>`; secrets: `<SettingsSecretInput>`.
3. Switch/select/combobox render through the wrappers in `shell/` with `save={save}` — never hand-roll `onValueChange`; a guard that vetoes returns `SETTINGS_SKIP_COMMIT`.
4. List buttons MUST NOT call `save()` — let the next blur/flush commit the whole list.
5. Each card POSTs a SPARSE Section patch, `sparseDiff(fromState(lastCommitted), fromState(submitted))` — the card shares its section with sibling cards and other tabs, so re-sending an untouched field would write a stale copy over someone else's change. The server deep-merges via `packages/server/src/domains/settings/services/merge-section-patch.ts` (the single merge implementation). `useSettingsCard` re-seeds the form only when clean and `toState(source)` differs from the current values.

## Copy

- Every interface string here is a UI message id under `admin.settings.*`, resolved with `useI18n()`; never a Chinese literal fallback.
- Shared validation schemas put typed `UiMessageId`s in Zod `message` slots, never prose; `useSettingsCard` localizes them via `localizeMessage` (missing param / unformattable template falls back to a generic localized sentence — never a token name, the raw ICU template, or the message id).
- The assets and security sections carry custom messages as `assetsValidationMessages` / `securityValidationMessages`. A strict patch with unknown keys rejects with the `admin.settings.errors.unrecognizedKeys` descriptor (one issue per key, the full key list in `params.keys`).
- The backup restore prompt retries on `apiErrorDescriptorKey(error) === 'backup.error.passwordWrong'`, never a localized-sentence match. Technical values (protocol names, URLs, paths, column names) stay as-is.
