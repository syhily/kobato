import type { z } from 'zod'

import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type DefaultValues, type FieldValues, type Resolver, type UseFormReturn, useForm } from 'react-hook-form'

import type { SettingsSection } from '@/shared/config/settings'

import { useSettingsMutation } from '@/ui/admin/settings/useSettingsMutation'

interface UseSettingsCardOptions<TSource, TState extends FieldValues> {
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

interface UseSettingsCardResult<TSource, TState extends FieldValues> {
  mode: 'read' | 'edit'
  setMode: (mode: 'read' | 'edit') => void
  form: UseFormReturn<TState>
  save: () => void
  cancel: () => void
  isPending: boolean
  status: 'idle' | 'saving' | 'saved' | 'error'
  errorMessage: string | null
  /** Resolved display data: optimistic if pending, else server source. */
  display: TSource
  /** Spread into <SettingGroup> to wire up edit/save/cancel/status. */
  settingGroupProps: {
    mode: 'read' | 'edit'
    onModeChange: (mode: 'read' | 'edit') => void
    onSave: () => void
    onCancel: () => void
    saveState: 'idle' | 'saving' | 'saved' | 'error'
    errorMessage: string | null
  }
}

function deepMerge(
  target: Record<string, unknown>,
  patch: Record<string, unknown>,
  seen: WeakSet<object> = new WeakSet(),
): Record<string, unknown> {
  const result = { ...target }
  for (const key of Object.keys(patch)) {
    const patchVal = patch[key]
    const targetVal = target[key]
    if (
      patchVal !== null &&
      typeof patchVal === 'object' &&
      !Array.isArray(patchVal) &&
      targetVal !== null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      if (seen.has(patchVal)) {
        continue
      }
      seen.add(patchVal)
      result[key] = deepMerge(targetVal as Record<string, unknown>, patchVal as Record<string, unknown>, seen)
    } else {
      result[key] = patchVal
    }
  }
  return result
}

export function useSettingsCard<TSource, TState extends FieldValues>({
  section,
  source,
  toState,
  fromState,
  schema,
  mode: mergeMode = 'patch',
}: UseSettingsCardOptions<TSource, TState>): UseSettingsCardResult<TSource, TState> {
  const [mode, setMode] = useState<'read' | 'edit'>('read')
  const [optimisticSource, setOptimisticSource] = useState<TSource | null>(null)
  const { commit, resetStatus, isPending, status, errorMessage } = useSettingsMutation()

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
    handleSubmit(async (values) => {
      const patchPayload = fromStateRef.current(values)
      const payload =
        mergeMode === 'patch' ? deepMerge(sourceRef.current as Record<string, unknown>, patchPayload) : patchPayload
      // Optimistic update: immediately reflect the submitted values in read mode
      // while the async request + revalidation happen in the background.
      setOptimisticSource(payload as TSource)
      setMode('read')
      try {
        await commit(section, payload)
      } catch {
        // commit already set error status
      }
    })().catch((error: unknown) => {
      if (error instanceof Error) {
        // Form validation errors are caught here; mutation errors are
        // handled inside commit().
      }
    })
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
    errorMessage,
    display: optimisticSource ?? source,
    settingGroupProps: {
      mode,
      onModeChange: setMode,
      onSave: save,
      onCancel: cancel,
      saveState: status,
      errorMessage,
    },
  }
}
