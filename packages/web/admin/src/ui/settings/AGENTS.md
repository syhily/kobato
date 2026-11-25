# Settings conventions

## Layout

Cross-section framework files stay at the root (`SettingsSection`, `SettingsHintTooltip`, `display`, `feature-flags`,
`useSettingsMutation`, `use-locale-switch`, `gravatar-mirror-presets`). Every multi-card section owns a subdirectory
(entry form, one file per card, kebab-case `model.ts`/`form-schema.ts`); a section stays at the root only while
genuinely single-card — do not flatten cards back into the root. `shell/SettingsWorkspace.tsx` owns the section registry
and the workspace shell; a route module only passes `bundle` / `timeZones` / `masks` / `onClose`.

## Save triggers

Saves are per card through `useSettingsCard` → `useSettingsMutation.commit(section, payload)`, blur-driven — typing
never fires a request. The save response is authoritative for display; the form baseline advances to the values it
submitted, never to the response.

- Text `<Input>`/`<Textarea>` — `flushOnBlur`, no-op if clean. Switch/Select/Combobox — `save` on `onChange` (after the
  upstream guard). List append/remove/move — no trigger; the next blur or flush commits.
- Framework flushes (close, ESC, scroll-away, page hide) call every registered card via `SettingsFlushProvider`;
  `flushAllAndWait()` resolves `true` only when EVERY card is clean.

## Commit and validation contract

- A failing whole-card commit KEEPS the dirty input and its error on screen; failures are never silent (toast + RHF
  field errors).
- A rejected field-scoped `save(field)` rolls THAT control back to its committed baseline; an edit made in flight wins.
- `commitWhole` diffs against `lastCommitted`: an empty diff POSTs nothing but still advances the baseline; on success
  the baseline advances to the CAPTURED submitted raw values, so input typed during the round trip stays dirty.
- `SettingsSelect` / `SettingsCombobox` await an upstream `onValueChange` guard before `save(name)`; a veto returns
  `SETTINGS_SKIP_COMMIT`.

## Locale switch

The General language selector is the sole transactional save, owned by `useLocaleSwitch`:

1. `await flushAllAndWait()` — any failure vetoes the switch with the unsaved input/errors intact.
2. The locale field commits via `save('locale')` only; `broadcast(locale)` announces it to peer tabs.
3. One `window.location.reload()` after the commit — never from an ordinary flush or `onSaved`.

While a transaction runs the select is `disabled`/`aria-busy` and `SettingsPanel` applies `inert` + `aria-busy` to the
ENTIRE workspace. Without the provider a transaction executes but warns; card-level tests are the only sanctioned
no-provider use.

## Cross-tab locale sync

Settings-side half only — the root loop lives in the public leaf (`ui/lib/LocaleSyncProvider`, mounted by
`apps/kobato/src/root.tsx`); cards use `useLocaleSyncPublish()`. The sender publishes once after the server acknowledged
the locale, immediately before this tab's single reload; the receiver runs the SAME transaction shape as a local switch,
then reloads only after the flush succeeded — it never commits the locale and never re-publishes. A failure keeps the
dirty input and offers Retry + explicit Reload; announcements are deduped by the bootstrap `revision`.

## Adding a settings card

1. `useSettingsCard()` — `flushOnBlur` for text inputs, `save` for switches/selects.
2. Text inputs render through `<SettingsInput flushOnBlur={...} {...form.register('x')}>` — never bare `<Input>`;
   `<SettingsTextarea>`; `<SettingsSecretInput>` for secrets.
3. Switch/select/combobox render through the `shell/` wrappers with `save={save}` — never hand-roll `onValueChange`.
4. List buttons MUST NOT call `save()`.
5. Each card POSTs a SPARSE Section patch (`sparseDiff(fromState(lastCommitted), fromState(submitted))`) — cards share
   their section with siblings and other tabs; the server deep-merges via
   `packages/server/src/domains/settings/services/merge-section-patch.ts`.

## Copy

- Every string is a UI message id under `admin.settings.*` resolved with `useI18n()`; never a Chinese literal fallback.
- Validation schemas put typed `UiMessageId`s in Zod `message` slots; `localizeMessage` falls back to a generic
  localized sentence — never a token name, raw ICU template, or message id.
- The backup restore prompt retries on `apiErrorDescriptorKey(error) === 'backup.error.passwordWrong'`, never a
  localized-sentence match.
