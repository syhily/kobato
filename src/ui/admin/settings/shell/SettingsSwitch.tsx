import type { ComponentProps } from 'react'

import { Switch } from '@/ui/components/switch'

// `<Switch>` + automatic immediate save for /admin/settings.
//
// The boolean-control counterpart to `SettingsInput`: a text input commits on
// blur (`flushOnBlur`), but a switch has no intermediate state worth
// deferring, so every toggle must commit immediately through
// `useSettingsCard.save`. Routing every switch through this wrapper keeps the
// two-step wiring in one place instead of hand-copied at every call site:
//   1. the upstream `onCheckedChange` (typically RHF's `field.onChange` from a
//      Controller render prop) fires first — driving form state and
//      `mode: 'onChange'` validation.
//   2. `save()` fires immediately after — committing the card.
//
// Replace:
//   `<Switch checked={field.value} onCheckedChange={(v) => { field.onChange(v); save() }} />`
// with:
//   `<SettingsSwitch name={field.name} checked={field.value} onCheckedChange={field.onChange} save={save} />`
//
// Like `SettingsInput`, the save trigger is split out as its own prop (rather
// than smuggled through the change handler) so the wrapper stays compatible
// with RHF's Controller render prop. The field's `name` rides along so the
// commit is scoped to just this field (P1-13 — see `useSettingsCard.save`).

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
