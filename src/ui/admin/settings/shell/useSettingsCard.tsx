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

import { getLogger } from '@/client/lib/logger'
import { useSettingsFlushContext } from '@/ui/admin/settings/shell/SettingsFlushProvider'
import { useSettingsMutation } from '@/ui/admin/settings/useSettingsMutation'

const log = getLogger('settings.card')

interface UseSettingsCardOptions<TSource extends object, TState extends FieldValues> {
  section: SettingsSection
  source: TSource
  toState: (source: TSource) => TState
  fromState: (state: TState) => Record<string, unknown>
  schema?: z.ZodType<TState, any>
  mode?: 'patch' | 'full'
}

interface UseSettingsCardResult<TSource extends object, TState extends FieldValues> {
  form: UseFormReturn<TState>
  isSaving: boolean
  /** Immediate commit. Skips the dirty guard but still runs validation.
   * Used by Switch / RadioGroup / Select — controls that have no "intermediate"
   * state worth deferring. */
  save: () => void
  /** Blur-driven commit. No-op when the form matches the last committed
   * snapshot. Used by `<SettingsInput>` on every text input. */
  flushOnBlur: () => void
  /** Top-level flush (close / scroll-away / page-hide). Same dirty guard as
   * `flushOnBlur`; the split name documents caller intent and leaves room for
   * the two to diverge later. */
  flush: () => void
  display: TSource
  settingGroupProps: {
    saveState: 'idle' | 'saving' | 'saved' | 'error'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function deepMerge<T extends object>(
  target: T,
  patch: Record<string, unknown>,
  seen: WeakSet<object> = new WeakSet(),
): T {
  const result: Record<string, unknown> = { ...(target as Record<string, unknown>) }
  for (const key of Object.keys(patch)) {
    const patchVal = patch[key]
    const targetVal = result[key]
    if (isRecord(patchVal) && isRecord(targetVal)) {
      if (seen.has(patchVal)) {
        continue
      }
      seen.add(patchVal)
      result[key] = deepMerge(targetVal, patchVal, seen)
    } else {
      result[key] = patchVal
    }
  }
  return result as T
}

function buildZodErrors<T extends FieldValues>(
  issues: { code: string; message: string; path: PropertyKey[] }[],
): FieldErrors<T> {
  const errors: Record<string, unknown> = {}
  for (const issue of issues) {
    let current: Record<string, unknown> = errors
    for (let i = 0; i < issue.path.length - 1; i++) {
      const key = issue.path[i] as string | number
      const nextKey = issue.path[i + 1]
      if (current[key] === undefined) {
        current[key] = typeof nextKey === 'number' ? [] : {}
      }
      current = current[key] as Record<string, unknown>
    }
    const lastKey = issue.path[issue.path.length - 1] as string | number
    current[lastKey] = { type: issue.code, message: issue.message } as FieldError
  }
  return errors as FieldErrors<T>
}

export function useSettingsCard<TSource extends object, TState extends FieldValues>({
  section,
  source,
  toState,
  fromState,
  schema,
  mode: mergeMode = 'patch',
}: UseSettingsCardOptions<TSource, TState>): UseSettingsCardResult<TSource, TState> {
  const [optimisticSource, setOptimisticSource] = useState<TSource | null>(null)
  const { commit, isPending, status } = useSettingsMutation()
  const { registerFlush } = useSettingsFlushContext()

  const initialValues = useMemo(() => toState(source) as DefaultValues<TState>, [source, toState])

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

  // Re-seed form when source changes (after a save in another card, after a
  // remote update, etc.). Reference-equality is insufficient on its own —
  // `revalidator.revalidate()` produces a fresh `source` reference on every
  // successful save, which would `reset()` away the user's in-flight edits.
  // So we only reseed when the form is *clean* (no uncommitted local edits).
  const [lastSourceSnapshot, setLastSourceSnapshot] = useState<TSource>(source)
  if (source !== lastSourceSnapshot) {
    setLastSourceSnapshot(source)

    const currentValues = getValues()
    const hasUncommittedEdits = JSON.stringify(currentValues) !== JSON.stringify(lastCommitted)

    if (!hasUncommittedEdits) {
      // Clean — safe to adopt the new server snapshot verbatim.
      const next = toState(source) as DefaultValues<TState>
      reset(next)
      setLastCommitted(next)
      if (optimisticSource !== null) {
        setOptimisticSource(null)
      }
    }
    // Dirty — keep the user's edits; the pending flush will commit them and
    // the next revalidate (now clean) will reseed safely.
  }

  const performSave = useCallback(() => {
    void handleSubmit(
      async (values) => {
        const patchPayload = fromState(values)
        const payload: TSource = mergeMode === 'patch' ? deepMerge(source, patchPayload) : (patchPayload as TSource)
        setOptimisticSource(payload)
        setLastCommitted(values as DefaultValues<TState>)
        const ok = await commit(section, payload as Record<string, unknown>)
        if (!ok) {
          setOptimisticSource(null)
        }
      },
      (errors) => {
        log.debug('Settings save validation failed, skipping', { errors })
      },
    )()
  }, [handleSubmit, mergeMode, section, commit, fromState, source])

  const isDirty = useCallback(() => {
    return JSON.stringify(getValues()) !== JSON.stringify(lastCommitted)
  }, [getValues, lastCommitted])

  // Switch / RadioGroup / Select / list buttons — fire immediately.
  const save = useCallback(() => {
    performSave()
  }, [performSave])

  // Text input blur — skip when nothing changed.
  const flushOnBlur = useCallback(() => {
    if (!isDirty()) return
    performSave()
  }, [isDirty, performSave])

  // Close / scroll-away / page-hide — skip when nothing changed.
  const flush = useCallback(() => {
    if (!isDirty()) return
    performSave()
  }, [isDirty, performSave])

  // Register this card's flush so the panel-level triggers (close, scroll,
  // visibilitychange) can reach it. Re-registers when `flush` identity
  // changes (i.e. when `lastCommitted` moves).
  useEffect(() => {
    return registerFlush(section, flush)
  }, [registerFlush, section, flush])

  return {
    form,
    isSaving: isPending,
    save,
    flushOnBlur,
    flush,
    display: optimisticSource ?? source,
    settingGroupProps: {
      saveState: status,
    },
  }
}
