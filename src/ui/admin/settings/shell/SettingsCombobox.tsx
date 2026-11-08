import type { ComponentProps } from 'react'

import { getLogger } from '@/client/lib/logger'
import { Combobox } from '@/ui/components/combobox'

const log = getLogger('settings.combobox')

// `<Combobox>` + immediate save, generic over the item type. The upstream
// `onValueChange` is AWAITED first (a caller may gate the change), then
// `save(name)` commits.

type ComboboxProps<Value> = ComponentProps<typeof Combobox<Value>>

interface SettingsComboboxProps<Value> extends Omit<ComboboxProps<Value>, 'onValueChange' | 'name'> {
  /** From `useSettingsCard().save` — awaited immediately after the change. */
  save: (field?: string) => unknown
  /** RHF field name — the commit is scoped to this field's change only. */
  name: string
  /** Optional upstream onValueChange; an async handler is awaited before `save`. */
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
            await onValueChange?.(value, eventDetails)
            await save(name)
          } catch (error) {
            log.warn('settings combobox change failed', { name, error })
          }
        })()
      }}
    />
  )
}
