import type { ComponentProps } from 'react'

import { Select } from '@/ui/components/select'

// `<Select>` + automatic immediate save for /admin/settings.
//
// Same save-on-change idiom as `SettingsSwitch` (see its header comment):
// the upstream `onValueChange` fires first, then `save()` commits the card
// immediately. The upstream handler is typically RHF's `field.onChange`
// (`onValueChange={field.onChange}`); call sites that transform the raw
// option string keep the transform inside their own handler
// (`onValueChange={(v) => field.onChange(Number(v))}`).
//
// Generic over the option value type, exactly like the wrapped `<Select>` —
// `value={field.value}` pins `Value` to the field's union, so `onValueChange`
// is typed `Value | null` and narrowing guards keep working unchanged.
//
// The trigger/content items (`SelectTrigger`, `SelectContent`, `SelectItem`,
// …) are presentational and stay imported from `@/ui/components/select`.

type SelectProps<Value> = ComponentProps<typeof Select<Value>>

interface SettingsSelectProps<Value> extends Omit<SelectProps<Value>, 'onValueChange'> {
  /** From `useSettingsCard().save` — fires immediately after the change. */
  save: () => void
  /** Optional upstream onValueChange (typically RHF `field.onChange`); merged with save. */
  onValueChange?: SelectProps<Value>['onValueChange']
}

export function SettingsSelect<Value>({ save, onValueChange, ...props }: SettingsSelectProps<Value>) {
  return (
    <Select<Value>
      {...props}
      onValueChange={(value, eventDetails) => {
        onValueChange?.(value, eventDetails)
        save()
      }}
    />
  )
}
