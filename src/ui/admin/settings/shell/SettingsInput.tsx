import type { ComponentProps, FocusEventHandler } from 'react'

import { Input } from '@/ui/components/input'
import { Textarea } from '@/ui/components/textarea'

// `<Input>` + blur-driven save: `flushOnBlur` is a separate prop so it
// survives `{...form.register('x')}` — the spread's `onBlur` would
// otherwise overwrite it.

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

// `<Textarea>` companion — same blur-saves pattern; controlled usage, so no
// RHF onBlur to merge.
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
