import type { ComponentProps } from 'react'

import { Checkbox } from '@kobato/ui/components/checkbox'

// `<Checkbox>` + immediate save: the upstream `onCheckedChange` fires
// first, then `save(name)` commits.

type CheckboxProps = ComponentProps<typeof Checkbox>

interface SettingsCheckboxProps extends Omit<CheckboxProps, 'onCheckedChange' | 'name'> {
  save: (field?: string) => unknown
  name: string
  onCheckedChange?: CheckboxProps['onCheckedChange']
}

export function SettingsCheckbox({ save, name, onCheckedChange, ...props }: SettingsCheckboxProps) {
  return (
    <Checkbox
      {...props}
      name={name}
      onCheckedChange={(checked, eventDetails) => {
        onCheckedChange?.(checked, eventDetails)
        void save(name)
      }}
    />
  )
}
