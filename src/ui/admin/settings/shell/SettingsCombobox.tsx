import type { ComponentProps } from 'react'

import { Combobox } from '@/ui/components/combobox'

// `<Combobox>` + automatic immediate save for /admin/settings.
//
// Same save-on-change idiom as `SettingsSwitch` (see its header comment):
// the upstream `onValueChange` fires first, then `save()` commits the card
// immediately. Generic over the item type, exactly like the wrapped
// `<Combobox>`. Call sites that store a derived value (e.g. the timezone
// card keeps `item.value`, not the item) keep that mapping — including any
// null guard — inside their own handler:
//   `onValueChange={(item) => { if (item) field.onChange(item.value) }}`
//
// The trigger/content items (`ComboboxTrigger`, `ComboboxContent`,
// `ComboboxItem`, …) are presentational and stay imported from
// `@/ui/components/combobox`.

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
