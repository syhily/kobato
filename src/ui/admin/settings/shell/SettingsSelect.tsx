import type { ComponentProps } from 'react'

import { Select } from '@/ui/components/select'

// `<Select>` + immediate save, generic over the option value type: the
// upstream `onValueChange` fires first, then `save(name)` commits.

type SelectProps<Value> = ComponentProps<typeof Select<Value>>

interface SettingsSelectProps<Value> extends Omit<SelectProps<Value>, 'onValueChange' | 'name'> {
  /** From `useSettingsCard().save` — fires immediately after the change. */
  save: (field?: string) => void
  /** RHF field name — the commit is scoped to this field's change only. */
  name: string
  /** Optional upstream onValueChange (typically RHF `field.onChange`); merged with save. */
  onValueChange?: SelectProps<Value>['onValueChange']
}

export function SettingsSelect<Value>({ save, name, onValueChange, ...props }: SettingsSelectProps<Value>) {
  return (
    <Select<Value>
      {...props}
      name={name}
      onValueChange={(value, eventDetails) => {
        onValueChange?.(value, eventDetails)
        save(name)
      }}
    />
  )
}
