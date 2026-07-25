import type { ComponentProps } from 'react'

import { RadioGroup } from '@/ui/components/radio-group'

// `<RadioGroup>` + automatic immediate save for /admin/settings.
//
// Same save-on-change idiom as `SettingsSwitch` (see its header comment):
// the upstream `onValueChange` (typically RHF's `field.onChange`) fires
// first, then `save()` commits the card immediately. The items
// (`RadioGroupItem`) are presentational and stay imported from
// `@/ui/components/radio-group`.

type RadioGroupProps = ComponentProps<typeof RadioGroup>

interface SettingsRadioGroupProps extends Omit<RadioGroupProps, 'onValueChange'> {
  /** From `useSettingsCard().save` — fires immediately after the change. */
  save: () => void
  /** Optional upstream onValueChange (typically RHF `field.onChange`); merged with save. */
  onValueChange?: RadioGroupProps['onValueChange']
}

export function SettingsRadioGroup({ save, onValueChange, ...props }: SettingsRadioGroupProps) {
  return (
    <RadioGroup
      {...props}
      onValueChange={(value, eventDetails) => {
        onValueChange?.(value, eventDetails)
        save()
      }}
    />
  )
}
