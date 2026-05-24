import type { z } from 'zod'

import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type DefaultValues, type FieldValues, type Resolver, type UseFormReturn, useForm } from 'react-hook-form'

import type { SettingsSection } from '@/shared/config/settings'

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
}

interface UseSettingsCardResult<TSource extends object, TState extends FieldValues> {
  mode: 'read' | 'edit'
  setMode: (mode: 'read' | 'edit') => void
  form: UseFormReturn<TState>
  save: () => void
  cancel: () => void
  isPending: boolean
  status: 'idle' | 'saving' | 'saved' | 'error'
  /** Resolved display data: optimistic if pending, else server source. */
  display: TSource
  /** Spread into <SettingGroup> to wire up edit/save/cancel/status. */
  settingGroupProps: {
    mode: 'read' | 'edit'
    onModeChange: (mode: 'read' | 'edit') => void
    onSave: () => void
    onCancel: () => void
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

export function useSettingsCard<TSource extends object, TState extends FieldValues>({
  section,
  source,
  toState,
  fromState,
  schema,
  mode: mergeMode = 'patch',
}: UseSettingsCardOptions<TSource, TState>): UseSettingsCardResult<TSource, TState> {
  const [mode, setMode] = useState<'read' | 'edit'>('read')
  const [optimisticSource, setOptimisticSource] = useState<TSource | null>(null)
  const { commit, resetStatus, isPending, status } = useSettingsMutation()

  // Stable references: callers pass module-level functions for `toState`
  // and `fromState`, so identity is stable across renders. Use refs to
  // avoid adding them to useMemo/useCallback dependency arrays (which
  // would cause unnecessary recalculations when callers inline arrows).
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
    return zodResolver(schema)
  }, [schema])

  const form = useForm<TState>({
    defaultValues: initialValues,
    resolver,
    mode: 'onBlur',
  })
  const { reset, handleSubmit } = form

  // Re-seed form when source changes (after a save in another card, after revert, etc.)
  // Only when not editing to avoid clobbering the user's current edits.
  const [lastSourceSnapshot, setLastSourceSnapshot] = useState<TSource>(source)
  useEffect(() => {
    if (source !== lastSourceSnapshot) {
      setLastSourceSnapshot(source)
      if (mode === 'read') {
        reset(initialValues)
      }
      // Real source has caught up (e.g. after revalidation); clear optimistic.
      if (optimisticSource !== null) {
        setOptimisticSource(null)
      }
    }
  }, [source, lastSourceSnapshot, mode, initialValues, reset, optimisticSource])

  const save = useCallback(() => {
    void handleSubmit(
      async (values) => {
        const patchPayload = fromStateRef.current(values)
        const payload: TSource =
          mergeMode === 'patch' ? deepMerge(sourceRef.current, patchPayload) : (patchPayload as TSource)
        // Optimistic update: immediately reflect the submitted values in read mode
        // while the async request + revalidation happen in the background.
        setOptimisticSource(payload)
        setMode('read')
        const ok = await commit(section, payload as Record<string, unknown>)
        if (!ok) {
          // Rollback: the server rejected the payload (validation, missing
          // file, etc.). Clear the optimistic overlay so the UI reverts to
          // the last known server state.
          setOptimisticSource(null)
        }
      },
      (errors) => {
        log.debug('Form validation failed', { errors })
      },
    )()
  }, [handleSubmit, mergeMode, section, commit])

  const cancel = useCallback(() => {
    reset(initialValues)
    resetStatus()
    setMode('read')
    setOptimisticSource(null)
  }, [initialValues, reset, resetStatus])

  return {
    mode,
    setMode,
    form,
    save,
    cancel,
    isPending,
    status,
    display: optimisticSource ?? source,
    settingGroupProps: {
      mode,
      onModeChange: setMode,
      onSave: save,
      onCancel: cancel,
      saveState: status,
    },
  }
}
