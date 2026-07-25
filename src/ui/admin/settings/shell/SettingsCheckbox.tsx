import type { ComponentProps } from 'react'

import { Checkbox } from '@/ui/components/checkbox'

// `<Checkbox>` + automatic immediate save for /admin/settings.
//
// Same save-on-change idiom as `SettingsSwitch` (see its header comment):
// the upstream `onCheckedChange` (typically RHF's `field.onChange`) fires
// first, then `save()` commits the card immediately. Used where a checkbox
// fits better than a switch (e.g. the navigation row's 新窗口 toggle).

type CheckboxProps = ComponentProps<typeof Checkbox>

interface SettingsCheckboxProps extends Omit<CheckboxProps, 'onCheckedChange'> {
  /** From `useSettingsCard().save` — fires immediately after the change. */
  save: () => void
  /** Optional upstream onCheckedChange (typically RHF `field.onChange`); merged with save. */
  onCheckedChange?: CheckboxProps['onCheckedChange']
}

export function SettingsCheckbox({ save, onCheckedChange, ...props }: SettingsCheckboxProps) {
  return (
    <Checkbox
      {...props}
      onCheckedChange={(checked, eventDetails) => {
        onCheckedChange?.(checked, eventDetails)
        save()
      }}
    />
  )
}
