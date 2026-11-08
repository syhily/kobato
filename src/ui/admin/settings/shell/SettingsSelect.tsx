import type { ComponentProps } from 'react'

import { getLogger } from '@/client/lib/logger'
import { Select } from '@/ui/components/select'

const log = getLogger('settings.select')

// `<Select>` + immediate save, generic over the option value type. The
// upstream `onValueChange` is AWAITED first (the locale switch flushes every
// dirty card there and may veto the change), then `save(name)` commits.

type SelectProps<Value> = ComponentProps<typeof Select<Value>>

interface SettingsSelectProps<Value> extends Omit<SelectProps<Value>, 'onValueChange' | 'name'> {
  /** From `useSettingsCard().save` — awaited immediately after the change. */
  save: (field?: string) => unknown
  /** RHF field name — the commit is scoped to this field's change only. */
  name: string
  /**
   * Optional upstream onValueChange (RHF `field.onChange`, or the locale
   * card's flush guard). An async handler is awaited before `save` — a switch
   * it vetoes must not commit anything.
   */
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
            await onValueChange?.(value, eventDetails)
            await save(name)
          } catch (error) {
            log.warn('settings select change failed', { name, error })
          }
        })()
      }}
    />
  )
}
