import type { ComponentProps } from 'react'

import { Checkbox } from '@kobato/ui/components/checkbox'

// `<Checkbox>` + automatic immediate save for /admin/settings.
//
// Same save-on-change idiom as `SettingsSwitch` (see its header comment):
// the upstream `onCheckedChange` (typically RHF's `field.onChange`) fires
// first, then `save()` commits the card immediately. Used where a checkbox
// fits better than a switch (e.g. the navigation row's 新窗口 toggle).

type CheckboxProps = ComponentProps<typeof Checkbox>

interface SettingsCheckboxProps extends Omit<CheckboxProps, 'onCheckedChange' | 'name'> {
  /** From `useSettingsCard().save` — fires immediately after the change. */
  save: (field?: string) => void
  /** RHF field name — the commit is scoped to this field's change only. */
  name: string
  /** Optional upstream onCheckedChange (typically RHF `field.onChange`); merged with save. */
  onCheckedChange?: CheckboxProps['onCheckedChange']
}

export function SettingsCheckbox({ save, name, onCheckedChange, ...props }: SettingsCheckboxProps) {
  return (
    <Checkbox
      {...props}
      name={name}
      onCheckedChange={(checked, eventDetails) => {
        onCheckedChange?.(checked, eventDetails)
        save(name)
      }}
    />
  )
}
