import type { ComponentProps } from 'react'

import { Switch } from '@/ui/components/switch'

// `<Switch>` + automatic immediate save: the upstream `onCheckedChange`
// fires first, then `save(name)` commits — scoped to just this field
// (P1-13 — see `useSettingsCard.save`).

type SwitchProps = ComponentProps<typeof Switch>

interface SettingsSwitchProps extends Omit<SwitchProps, 'onCheckedChange' | 'name'> {
  /** From `useSettingsCard().save` — fires immediately after the change. */
  save: (field?: string) => void
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
        save(name)
      }}
    />
  )
}
