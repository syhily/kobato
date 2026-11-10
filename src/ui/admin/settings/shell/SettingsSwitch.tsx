import type { ComponentProps } from 'react'

import { Switch } from '@/ui/components/switch'

// `<Switch>` + immediate save: upstream `onCheckedChange` fires first, then `save(name)` commits this field.

type SwitchProps = ComponentProps<typeof Switch>

interface SettingsSwitchProps extends Omit<SwitchProps, 'onCheckedChange' | 'name'> {
  /** From `useSettingsCard().save` — fires immediately after the change. */
  save: (field?: string) => unknown
  /** RHF field name — the commit is scoped to this field's change only. */
  name: string
  /** Optional upstream onCheckedChange (typically RHF `field.onChange`); merged with save. */
  onCheckedChange?: SwitchProps['onCheckedChange']
}

export function SettingsSwitch({ save, name, onCheckedChange, ...props }: SettingsSwitchProps) {
  return (
    <Switch
      {...props}
      name={name}
      onCheckedChange={(checked, eventDetails) => {
        onCheckedChange?.(checked, eventDetails)
        void save(name)
      }}
    />
  )
}
