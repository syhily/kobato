import type { z } from 'zod'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type DefaultValues,
  type FieldError,
  type FieldErrors,
  type FieldValues,
  type Resolver,
  type UseFormReturn,
  useForm,
} from 'react-hook-form'

import type { SettingsSection } from '@/shared/config/sections'
import type { SettingsSectionPatch } from '@/shared/config/types'

import { getLogger } from '@/client/lib/logger'
import { unsafeCast } from '@/shared/utils/unsafe-cast'
import { useSettingsFlushContext } from '@/ui/admin/settings/shell/SettingsFlushProvider'
import { useSettingsMutation } from '@/ui/admin/settings/useSettingsMutation'

const log = getLogger('settings.card')

interface UseSettingsCardBaseOptions<TSource extends object, TState extends FieldValues> {
  source: TSource
  toState: (source: TSource) => TState
  schema?: z.ZodType<TState, any>
}

type UseSettingsCardOptions<TSource extends object, TState extends FieldValues> = {
  [Section in SettingsSection]: UseSettingsCardBaseOptions<TSource, TState> & {
    section: Section
    fromState: (state: TState) => SettingsSectionPatch<Section>
  }
}[SettingsSection]

interface UseSettingsCardResult<TSource extends object, TState extends FieldValues> {
  form: UseFormReturn<TState>
  isSaving: boolean
  /** Immediate commit. Skips the dirty guard but still runs validation.
   * Used by Switch / RadioGroup / Select — controls that have no "intermediate"
   * state worth deferring. */
  save: () => void
  /** Blur-driven commit. No-op when the form matches the last committed
   * snapshot. Used by `<SettingsInput>` on every text input, and by the
   * panel-level flush triggers (close / scroll-away / page-hide) via the
   * SettingsFlushProvider registry. */
  flushOnBlur: () => void
  /** Latest server-confirmed section (the save response, masks/font families
   * included), falling back to the loader snapshot. Never POSTed. */
  display: TSource
  settingGroupProps: {
    saveState: 'idle' | 'saving' | 'saved' | 'error'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isFieldErrorRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value)
}

// Zod issue paths are PropertyKey[] (string | number | symbol). RHF error
// trees key by string, so every path element is coerced via `String()`. The
// narrowing is total — no information is lost because every PropertyKey has
// a well-defined string form.
function pathKey(p: PropertyKey): string {
  return typeof p === 'string' ? p : String(p)
}

function buildZodErrors<T extends FieldValues>(
  issues: { code: string; message: string; path: PropertyKey[] }[],
): FieldErrors<T> {
  const errors: Record<string, unknown> = {}
  for (const issue of issues) {
    let current: Record<string, unknown> = errors
    for (let i = 0; i < issue.path.length - 1; i++) {
      const key = pathKey(issue.path[i])
      const nextKey = issue.path[i + 1]
      if (current[key] === undefined) {
        current[key] = typeof nextKey === 'number' ? [] : {}
      }
      const stepped = current[key]
      if (isFieldErrorRecord(stepped)) {
        current = stepped
      } else {
        // The path walked into an array slot or primitive that earlier issues
        // materialised; step in by treating it as a record. Runtime shape is
        // already correct because every prior iteration wrote a container.
        current = unsafeCast<Record<string, unknown>>(stepped)
      }
    }
    const lastKey = pathKey(issue.path[issue.path.length - 1])
    current[lastKey] = { type: issue.code, message: issue.message } satisfies FieldError
  }
  // The hand-built `errors` object mirrors RHF's FieldErrors<T> shape one
  // leaf at a time; the cast is structural, not semantic.
  return unsafeCast<FieldErrors<T>>(errors)
}

export function useSettingsCard<TSource extends object, TState extends FieldValues>({
  section,
  source,
  toState,
  fromState,
  schema,
}: UseSettingsCardOptions<TSource, TState>): UseSettingsCardResult<TSource, TState> {
  const [savedSource, setSavedSource] = useState<TSource | null>(null)
  const { commit, isPending, status } = useSettingsMutation()
  const { registerFlush } = useSettingsFlushContext()

  // `toState` returns the form's TState; DefaultValues<TState> is structurally
  // wider (allows `undefined` leaves) so RHF accepts partial seeds.
  const initialValues = useMemo(() => unsafeCast<DefaultValues<TState>>(toState(source)), [source, toState])

  const resolver = useMemo<Resolver<TState> | undefined>(() => {
    if (!schema) {
      return undefined
    }
    return async (values) => {
      const result = await schema.safeParseAsync(values)
      if (result.success) {
        return { values: result.data, errors: {} }
      }
      return { values: {}, errors: buildZodErrors<TState>(result.error.issues) }
    }
  }, [schema])

  const form = useForm<TState>({
    defaultValues: initialValues,
    resolver,
    mode: 'onChange',
  })
  const { reset, handleSubmit, getValues } = form

  // Last snapshot the server has acknowledged (or the initial seed). Drives
  // the dirty guard: if `getValues()` deep-equals this, flush is a no-op.
  const [lastCommitted, setLastCommitted] = useState<DefaultValues<TState>>(initialValues)

  // Re-seed form when source changes (navigation back to the page, a remote
  // concurrent edit — saves no longer revalidate the loader, so this is a
  // backstop, not the hot path). Reference-equality is insufficient on its
  // own — a fresh `source` reference with identical content must not
  // `reset()` away the user's in-flight edits. So we only reseed when the
  // form is *clean* (no uncommitted local edits).
  const [lastSourceSnapshot, setLastSourceSnapshot] = useState<TSource>(source)
  if (source !== lastSourceSnapshot) {
    setLastSourceSnapshot(source)

    const currentValues = getValues()
    const hasUncommittedEdits = JSON.stringify(currentValues) !== JSON.stringify(lastCommitted)

    if (!hasUncommittedEdits) {
      const next = unsafeCast<DefaultValues<TState>>(toState(source))
      // Skip the reset when the incoming snapshot maps to the SAME form
      // state. `reset()` is never free: it regenerates useFieldArray ids
      // (remounting every row and dropping focus mid-typing) and clobbers
      // the caret in plain inputs.
      if (JSON.stringify(next) !== JSON.stringify(currentValues)) {
        reset(next)
        setLastCommitted(next)
      }
      if (savedSource !== null) {
        setSavedSource(null)
      }
    }
    // Dirty — keep the user's edits; the pending flush will commit them and
    // the next source change (now clean) will reseed safely.
  }

  const performSave = useCallback(() => {
    void handleSubmit(
      async (values) => {
        // The card posts its honest Section patch — only the fields it
        // owns, no masks, no untouched siblings. The server deep-merges
        // the patch against the stored row, validates the result, and
        // returns the merged section in admin display shape — the
        // response is authoritative and becomes the card's new baseline.
        const patchPayload = fromState(values)
        const result = await commit(section, patchPayload)
        if (result.ok) {
          // `result.section` is the server-produced TSource (masks merged
          // in for assets/mail/search) — the same shape the loader feeds
          // this card as `source`.
          setSavedSource(unsafeCast<TSource>(result.section))
          setLastCommitted(unsafeCast<DefaultValues<TState>>(values))
        } else {
          // Keep the form dirty (lastCommitted untouched) so the next
          // flush retries; display falls back to the loader snapshot.
          setSavedSource(null)
        }
      },
      (errors) => {
        log.debug('Settings save validation failed, skipping', { errors })
      },
    )()
  }, [handleSubmit, section, commit, fromState])

  const isDirty = useCallback(() => {
    return JSON.stringify(getValues()) !== JSON.stringify(lastCommitted)
  }, [getValues, lastCommitted])

  // Switch / RadioGroup / Select / list buttons — fire immediately.
  const save = useCallback(() => {
    performSave()
  }, [performSave])

  // Text input blur — skip when nothing changed. Also the callback the
  // panel-level flush registry invokes (close / scroll-away / page-hide).
  const flushOnBlur = useCallback(() => {
    if (!isDirty()) {
      return
    }
    performSave()
  }, [isDirty, performSave])

  // Register this card's flush so the panel-level triggers (close, scroll,
  // visibilitychange) can reach it. Re-registers when `flushOnBlur` identity
  // changes (i.e. when `lastCommitted` moves).
  useEffect(() => {
    return registerFlush(section, flushOnBlur)
  }, [registerFlush, section, flushOnBlur])

  return {
    form,
    isSaving: isPending,
    save,
    flushOnBlur,
    display: savedSource ?? source,
    settingGroupProps: {
      saveState: status,
    },
  }
}
