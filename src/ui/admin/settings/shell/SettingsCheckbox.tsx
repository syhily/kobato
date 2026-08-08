import type { ComponentProps } from 'react'

import { Checkbox } from '@/ui/components/checkbox'

// `<Checkbox>` + immediate save: the upstream `onCheckedChange` fires
// first, then `save(name)` commits.

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
