import type { ComponentProps } from 'react'
import type { FocusEventHandler } from 'react'

import { Input } from '@/ui/components/input'

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
}

export function SettingsInput({ flushOnBlur, onBlur, ...props }: SettingsInputProps) {
  const handleBlur: FocusEventHandler<HTMLInputElement> = (event) => {
    onBlur?.(event)
    flushOnBlur()
  }

  return <Input {...props} onBlur={handleBlur} />
}
