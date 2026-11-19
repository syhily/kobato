import type { ComponentProps, FocusEventHandler } from 'react'

import { Input } from '@kobato/ui/components/input.tsx'
import { Textarea } from '@kobato/ui/components/textarea.tsx'

// `<Input>` + blur-driven save: `flushOnBlur` is a separate prop so it
// survives `{...form.register('x')}` — the spread's `onBlur` would
// otherwise overwrite it.

type InputProps = ComponentProps<typeof Input>

interface SettingsInputProps extends Omit<InputProps, 'onBlur'> {
  flushOnBlur: () => void
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
  flushOnBlur: () => void
  onBlur?: FocusEventHandler<HTMLTextAreaElement>
}

export function SettingsTextarea({ flushOnBlur, onBlur, ...props }: SettingsTextareaProps) {
  const handleBlur: FocusEventHandler<HTMLTextAreaElement> = (event) => {
    onBlur?.(event)
    flushOnBlur()
  }

  return <Textarea {...props} onBlur={handleBlur} />
}
