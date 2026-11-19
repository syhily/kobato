import type { ComponentProps, FocusEventHandler } from 'react'

import { Input } from '@kobato/ui/components/input.tsx'
import { Textarea } from '@kobato/ui/components/textarea.tsx'

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
