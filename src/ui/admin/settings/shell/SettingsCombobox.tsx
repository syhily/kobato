import type { ComponentProps } from 'react'

import { getLogger } from '@/client/lib/logger'
import { isSettingsSkipCommit } from '@/ui/admin/settings/shell/settings-change-verdict'
import { Combobox } from '@/ui/components/combobox'

const log = getLogger('settings.combobox')

// `<Combobox>` + immediate save, generic over the item type. The upstream
// `onValueChange` guard is AWAITED first; returning `SETTINGS_SKIP_COMMIT`
// vetoes the change (no commit) — any other result lets the wrapper commit the
// field.

type ComboboxProps<Value> = ComponentProps<typeof Combobox<Value>>

interface SettingsComboboxProps<Value> extends Omit<ComboboxProps<Value>, 'onValueChange' | 'name'> {
  /** From `useSettingsCard().save` — awaited immediately after the change. A
   *  rejected commit rolls this field back to its committed value in the hook. */
  save: (field?: string) => unknown
  /** RHF field name — the commit is scoped to this field's change only. */
  name: string
  /**
   * Optional upstream guard; returning `SETTINGS_SKIP_COMMIT` suppresses the
   * wrapper's commit. Any other result lets it save.
   */
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
