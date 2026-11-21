import type { ComponentProps } from 'react'

import { Select } from '@kobato/ui/components/select'
import { getLogger } from '@kobato/ui/lib/logger'
import { isSettingsSkipCommit } from '@kobato/web-admin/ui/settings/shell/settings-change-verdict'

const log = getLogger('settings.select')

type SelectProps<Value> = ComponentProps<typeof Select<Value>>

interface SettingsSelectProps<Value> extends Omit<SelectProps<Value>, 'onValueChange' | 'name'> {
  save: (field?: string) => unknown
  name: string
  onValueChange?: (value: Value | null, eventDetails: unknown) => unknown
}

export function SettingsSelect<Value>({ save, name, onValueChange, ...props }: SettingsSelectProps<Value>) {
  return (
    <Select<Value>
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
            log.warn('settings select change failed', { name, error })
          }
        })()
      }}
    />
  )
}
