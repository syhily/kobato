import type { z } from 'zod'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { useSettingsMutation } from '@/ui/admin/settings/useSettingsMutation'

const log = getLogger('settings.card')

interface UseSettingsCardOptions<TSource extends object, TState extends FieldValues> {
  section: SettingsSection
  source: TSource
  toState: (source: TSource) => TState
  /**
   * Project the editable form state into the payload sent to the server.
   * In patch mode (default), return only the fields this card edits — the
   * hook auto-merges with `source` to produce a full section payload.
   * When `mode: 'full'`, return the full section payload manually.
   */
  fromState: (state: TState) => Record<string, unknown>
  schema?: z.ZodType<TState, any>
  /**
   * When `'patch'` (default), `fromState` only needs to return the changed
   * sub-tree; the hook deep-merges it with `source`. When `'full'`,
   * `fromState` must return the complete section payload.
   */
  mode?: 'patch' | 'full'
  /** Debounce delay for auto-save in ms. Default 500. */
  debounceMs?: number
}

interface UseSettingsCardResult<TSource extends object, TState extends FieldValues> {
  form: UseFormReturn<TState>
  isSaving: boolean
  /** Immediate save — call from switch onCheckedChange. */
  save: () => void
  /** Resolved display data: optimistic if saving, else server source. */
  display: TSource
  /** Spread into <SettingGroup> for the saving indicator. */
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
  debounceMs = 500,
}: UseSettingsCardOptions<TSource, TState>): UseSettingsCardResult<TSource, TState> {
  const [optimisticSource, setOptimisticSource] = useState<TSource | null>(null)
  const { commit, isPending, status } = useSettingsMutation()

  const toStateRef = useRef(toState)
  const fromStateRef = useRef(fromState)
  const sourceRef = useRef(source)

  useEffect(() => {
    toStateRef.current = toState
    fromStateRef.current = fromState
    sourceRef.current = source
  })

  const initialValues = useMemo(() => toStateRef.current(source) as DefaultValues<TState>, [source])

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

  // Re-seed form when source changes (after a save in another card, after revert, etc.)
  const [lastSourceSnapshot, setLastSourceSnapshot] = useState<TSource>(source)
  useEffect(() => {
    if (source !== lastSourceSnapshot) {
      setLastSourceSnapshot(source)
      reset(initialValues)
      lastCommittedRef.current = initialValues
      if (optimisticSource !== null) {
        setOptimisticSource(null)
      }
    }
  }, [source, lastSourceSnapshot, initialValues, reset, optimisticSource])

  // --- Auto-save ---
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSavingRef = useRef(false)
  const lastCommittedRef = useRef<DefaultValues<TState>>(initialValues)

  useEffect(() => {
    isSavingRef.current = isPending
  }, [isPending])

  const performSave = useCallback(() => {
    void handleSubmit(
      async (values) => {
        const patchPayload = fromStateRef.current(values)
        const payload: TSource =
          mergeMode === 'patch' ? deepMerge(sourceRef.current, patchPayload) : (patchPayload as TSource)
        setOptimisticSource(payload)
        lastCommittedRef.current = values as DefaultValues<TState>
        const ok = await commit(section, payload as Record<string, unknown>)
        if (!ok) {
          setOptimisticSource(null)
        }
      },
      (errors) => {
        log.debug('Auto-save validation failed, skipping', { errors })
      },
    )()
  }, [handleSubmit, mergeMode, section, commit])

  // Debounced auto-save triggered by form changes
  const watchedValues = form.watch()
  useEffect(() => {
    // Compare against last committed values instead of formState.isDirty
    // to avoid needing reset() which causes Switch UI flicker.
    const current = getValues()
    if (JSON.stringify(current) === JSON.stringify(lastCommittedRef.current)) {
      return
    }
    if (isSavingRef.current) {
      return
    }

    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current)
    }
    debounceTimerRef.current = setTimeout(performSave, debounceMs)

    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [watchedValues, getValues, performSave, debounceMs])

  // Immediate save for switches — clears debounce and fires now
  const save = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    performSave()
  }, [performSave])

  return {
    form,
    isSaving: isPending,
    save,
    display: optimisticSource ?? source,
    settingGroupProps: {
      saveState: status,
    },
  }
}
