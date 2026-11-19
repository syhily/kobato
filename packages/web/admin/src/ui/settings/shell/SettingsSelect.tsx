import type { ComponentProps } from 'react'

import { Select } from '@kobato/ui/components/select.tsx'
import { getLogger } from '@kobato/ui/lib/logger.ts'
import { isSettingsSkipCommit } from '@kobato/web-admin/ui/settings/shell/settings-change-verdict.ts'

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
        // Base UI ignores the promise; own the rejection so a failed upstream
        // guard never becomes an unhandled rejection, and never save after it.
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
