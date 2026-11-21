import type { ComponentProps } from 'react'

import { Combobox } from '@kobato/ui/components/combobox'
import { getLogger } from '@kobato/ui/lib/logger'
import { isSettingsSkipCommit } from '@kobato/web-admin/ui/settings/shell/settings-change-verdict'

const log = getLogger('settings.combobox')

type ComboboxProps<Value> = ComponentProps<typeof Combobox<Value>>

interface SettingsComboboxProps<Value> extends Omit<ComboboxProps<Value>, 'onValueChange' | 'name'> {
  save: (field?: string) => unknown
  name: string
  onValueChange?: (value: Value | null, eventDetails: unknown) => unknown
}

export function SettingsCombobox<Value>({ save, name, onValueChange, ...props }: SettingsComboboxProps<Value>) {
  return (
    <Combobox<Value>
      {...props}
      name={name}
      onValueChange={(value, eventDetails) => {
        void (async () => {
          try {
            const verdict = await onValueChange?.(value, eventDetails)
            if (isSettingsSkipCommit(verdict)) {
              return
            }
            await save(name)
          } catch (error) {
            log.warn('settings combobox change failed', { name, error })
          }
        })()
      }}
    />
  )
}
