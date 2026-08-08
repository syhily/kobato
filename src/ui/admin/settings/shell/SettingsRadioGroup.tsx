import type { ComponentProps } from 'react'

import { RadioGroup } from '@/ui/components/radio-group'

// `<RadioGroup>` + immediate save: the upstream `onValueChange` fires
// first, then `save(name)` commits.

type RadioGroupProps = ComponentProps<typeof RadioGroup>

interface SettingsRadioGroupProps extends Omit<RadioGroupProps, 'onValueChange' | 'name'> {
  /** From `useSettingsCard().save` — fires immediately after the change. */
  save: (field?: string) => void
  /** RHF field name — the commit is scoped to this field's change only. */
  name: string
  /** Optional upstream onValueChange (typically RHF `field.onChange`); merged with save. */
  onValueChange?: RadioGroupProps['onValueChange']
}

export function SettingsRadioGroup({ save, name, onValueChange, ...props }: SettingsRadioGroupProps) {
  return (
    <RadioGroup
      {...props}
      name={name}
      onValueChange={(value, eventDetails) => {
        onValueChange?.(value, eventDetails)
        save(name)
      }}
    />
  )
}
