import type { ComponentProps } from 'react'

import { Combobox } from '@/ui/components/combobox'

// `<Combobox>` + immediate save, generic over the item type: the upstream
// `onValueChange` fires first, then `save(name)` commits.

type ComboboxProps<Value> = ComponentProps<typeof Combobox<Value>>

interface SettingsComboboxProps<Value> extends Omit<ComboboxProps<Value>, 'onValueChange' | 'name'> {
  /** From `useSettingsCard().save` — fires immediately after the change. */
  save: (field?: string) => void
  /** RHF field name — the commit is scoped to this field's change only. */
  name: string
  /** Optional upstream onValueChange; merged with save. */
  onValueChange?: ComboboxProps<Value>['onValueChange']
}

export function SettingsCombobox<Value>({ save, name, onValueChange, ...props }: SettingsComboboxProps<Value>) {
  return (
    <Combobox<Value>
      {...props}
      name={name}
      onValueChange={(value, eventDetails) => {
        onValueChange?.(value, eventDetails)
        save(name)
      }}
    />
  )
}
