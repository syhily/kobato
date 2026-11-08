# Settings conventions

`/admin/settings` saves per-card via `useSettingsCard` backed by `useSettingsMutation.commit(section, payload)`. The save model is **blur-driven** — typing never fires a request. The save response is authoritative: the card adopts it as its new baseline without refetching.

Controls trigger saves differently:

| Control                       | Trigger       | When it fires                                                                 |
| ----------------------------- | ------------- | ----------------------------------------------------------------------------- |
| Text `<Input>` / `<Textarea>` | `flushOnBlur` | Input loses focus; no-op if clean                                             |
| Switch / Select / Combobox    | `save`        | `onChange`, immediately (after awaiting an async upstream `onValueChange`)    |
| **General locale `Select`**   | `save`        | **The one exception** — see below: flush every dirty card, THEN commit locale |
| List append/remove/move       | none          | Relies on the next blur or a flush                                            |

Framework-level flushes (close, ESC, scroll-away, page hide) call every registered card via `SettingsFlushProvider`. `flushAll` / `flushSection` are fire-and-forget; `flushAllAndWait()` is the awaitable variant and resolves `true` only when EVERY card is clean (each card flush resolves a boolean — validation failure, rejected commit and exceptions are `false`).

**The locale Select is the sole exception to "Switch/Select → onChange immediately saves".** Its upstream `onValueChange` runs `await flushAllAndWait()` first. Only when that resolves `true` does it call `field.onChange(newLocale)`; `SettingsSelect` then awaits `save('locale')`. Any failure (validation, commit, thrown handler) vetoes the whole switch: no field change, no locale save, no reload, and the unsaved input/errors stay on screen (the panel flush never resets dirty input). A reload happens only in `onSaved`, when `savedSection.locale` actually differs from the loader's original `siteIdentity.locale` — other general saves and same-value reselects never reload.

`SettingsSelect` / `SettingsCombobox` AWAIT an async `onValueChange` before `save(name)` — a guard that vetoes the change must not commit anything.

## Adding a settings card

1. Use `useSettingsCard()` — destructure `flushOnBlur` for text inputs, `save` for switches/selects.
2. Text inputs: render through `<SettingsInput flushOnBlur={flushOnBlur} {...form.register('x')}>` — never bare `<Input>`. Multi-line: `<SettingsTextarea>`; secrets: `<SettingsSecretInput>`.
3. Switch/select/combobox: render through the wrapper components in `src/ui/admin/settings/shell/` with `save={save}` — never hand-roll `onValueChange`.
4. List buttons MUST NOT call `save()` — let the next blur/flush commit the whole list.
5. `useSettingsCard` re-seeds the form only when clean and `toState(source)` differs from current form values — prevents lost edits and focus drops.

Each card POSTs an honest Section patch (owned fields only). The server deep-merges, validates, and writes only that row. `src/shared/config/merge-section-patch.ts` is the single merge implementation.

## Copy

Every interface string on this surface — card titles, hints, validation errors, toasts, dialog
buttons — is a UI message id under `admin.settings.*`, resolved with `useI18n()`; never a Chinese
literal fallback. `secretFieldStrings({ t, … })` takes the card's translator because its configured
hint is a catalog message. Shared validation schemas (`shared/config/rate-limit-bucket`, the general
write schema) put typed `UiMessageId`s in Zod `message` slots, never prose: `useSettingsCard`
localizes them before building the RHF error tree (`localizeMessage`, interpolating the `{min}` /
`{max}` bounds from `utils/zod-issue-bounds` or a custom issue's `params`), and the server maps the
same ids into wire descriptors (`server/infra/http/error-descriptor`). The assets and security
sections carry their custom messages as `assetsValidationMessages` / `securityValidationMessages`;
a strict patch with unknown keys rejects with the `admin.settings.errors.unrecognizedKeys`
descriptor (one issue per key, full key list in `params.keys`, field path preserved). The backup
restore prompt retries on `apiErrorDescriptorKey(error) === 'backup.error.passwordWrong'` — never a
localized-sentence match. Technical values (protocol names, URLs, paths,
database column names) stay as-is.
