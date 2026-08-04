import type { ComponentProps, FocusEventHandler } from 'react'

import { Input } from '@kobato/ui/components/input'
import { Textarea } from '@kobato/ui/components/textarea'

// `<Input>` + automatic blur-driven save for /admin/settings.
//
// Every text/number/url/email/password input on the settings page must go
// through this wrapper so that:
//   1. react-hook-form's own `onBlur` (register/Controller) still fires — it
//      drives `mode: 'onChange'` field-level validation and the `touched`
//      flag.
//   2. `useSettingsCard.flushOnBlur` fires immediately after — committing the
//      edit if (and only if) the form is dirty.
//
// Replace `<Input {...form.register('x')} />` with:
//   `<SettingsInput flushOnBlur={flushOnBlur} {...form.register('x')} />`
//
// The `flushOnBlur` prop is split out from the rest (rather than smuggled
// through `register`'s onBlur) so it survives `{...form.register('x')}` —
// the spread's `onBlur` would otherwise overwrite a prop of the same name.

type InputProps = ComponentProps<typeof Input>

interface SettingsInputProps extends Omit<InputProps, 'onBlur'> {
  /** From `useSettingsCard().flushOnBlur`. */
  flushOnBlur: () => void
  /** Optional upstream onBlur (e.g. from `form.register()`); merged with flushOnBlur. */
  onBlur?: FocusEventHandler<HTMLInputElement>
}

export function SettingsInput({ flushOnBlur, onBlur, ...props }: SettingsInputProps) {
  const handleBlur: FocusEventHandler<HTMLInputElement> = (event) => {
    onBlur?.(event)
    flushOnBlur()
  }

  return <Input {...props} onBlur={handleBlur} />
}

// `<Textarea>` companion to `SettingsInput`. Same blur-saves pattern; needed
// for the robots.txt card and any future multi-line field. Controlled usage
// (these fields use `value`/`onChange` rather than `register`), so there's no
// RHF onBlur to merge — flushOnBlur runs directly.
type TextareaProps = ComponentProps<typeof Textarea>

interface SettingsTextareaProps extends Omit<TextareaProps, 'onBlur'> {
  /** From `useSettingsCard().flushOnBlur`. */
  flushOnBlur: () => void
  /** Optional upstream onBlur; merged with flushOnBlur. */
  onBlur?: FocusEventHandler<HTMLTextAreaElement>
}

export function SettingsTextarea({ flushOnBlur, onBlur, ...props }: SettingsTextareaProps) {
  const handleBlur: FocusEventHandler<HTMLTextAreaElement> = (event) => {
    onBlur?.(event)
    flushOnBlur()
  }

  return <Textarea {...props} onBlur={handleBlur} />
}
