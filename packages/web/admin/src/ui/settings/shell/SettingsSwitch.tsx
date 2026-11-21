import type { ComponentProps } from 'react'

import { Switch } from '@kobato/ui/components/switch'

// `<Switch>` + immediate save: upstream `onCheckedChange` fires first, then `save(name)` commits this field.

type SwitchProps = ComponentProps<typeof Switch>

interface SettingsSwitchProps extends Omit<SwitchProps, 'onCheckedChange' | 'name'> {
  save: (field?: string) => unknown
  name: string
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
