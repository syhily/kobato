import type { ComponentProps } from 'react'

import { getLogger } from '@/client/lib/logger'
import { isSettingsSkipCommit } from '@/ui/admin/settings/shell/settings-change-verdict'
import { Select } from '@/ui/components/select'

const log = getLogger('settings.select')

// `<Select>` + immediate save, generic over the option value type. The
// upstream `onValueChange` guard is AWAITED first; returning
// `SETTINGS_SKIP_COMMIT` vetoes the change (the wrapper must not commit
// anything) — no result lets the wrapper commit the field.

type SelectProps<Value> = ComponentProps<typeof Select<Value>>

interface SettingsSelectProps<Value> extends Omit<SelectProps<Value>, 'onValueChange' | 'name'> {
  /** From `useSettingsCard().save` — awaited immediately after the change. A
   *  rejected commit rolls this field back to its committed value in the hook. */
  save: (field?: string) => unknown
  /** RHF field name — the commit is scoped to this field's change only. */
  name: string
  /**
   * Optional upstream guard (RHF `field.onChange`, or the locale card's
   * transaction, which commits the field itself). Returning
   * `SETTINGS_SKIP_COMMIT` suppresses the wrapper's commit; any other result
   * lets it save.
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
