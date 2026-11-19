import type { ComponentProps } from 'react'

import { Combobox } from '@kobato/ui/components/combobox.tsx'
import { getLogger } from '@kobato/ui/lib/logger.ts'
import { isSettingsSkipCommit } from '@kobato/web-admin/ui/settings/shell/settings-change-verdict.ts'

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
        // Base UI ignores the promise; own the rejection so a failed upstream
        // handler never becomes an unhandled rejection, and never save after it.
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
