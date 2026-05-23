import type { z } from 'zod'

import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type DefaultValues, type FieldValues, type Resolver, type UseFormReturn, useForm } from 'react-hook-form'
import { useRevalidator } from 'react-router'

import type { SettingsSection } from '@/shared/config/settings'

import { orpc } from '@/client/api/client'
import { useMutation } from '@/client/api/query'

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
  /** Optimistic source derived from the last submitted form state. */
  optimisticSource: TSource | null
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

function deepMerge(target: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
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
      result[key] = deepMerge(targetVal as Record<string, unknown>, patchVal as Record<string, unknown>)
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
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [optimisticSource, setOptimisticSource] = useState<TSource | null>(null)
  const revalidator = useRevalidator()

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

  const updateMutation = useMutation({
    mutationFn: ({ section, payload }: { section: SettingsSection; payload: Record<string, unknown> }) =>
      orpc.admin.settings.update({ section, payload }),
  })

  const save = useCallback(() => {
    handleSubmit(async (values) => {
      setStatus('saving')
      setErrorMessage(null)
      const patchPayload = fromStateRef.current(values)
      const payload =
        mergeMode === 'patch' ? deepMerge(sourceRef.current as Record<string, unknown>, patchPayload) : patchPayload
      // Optimistic update: immediately reflect the submitted values in read mode
      // while the async request + revalidation happen in the background.
      setOptimisticSource(payload as TSource)
      setMode('read')
      try {
        await updateMutation.mutateAsync({ section, payload })
        setStatus('saved')
        void revalidator.revalidate()
      } catch (error: unknown) {
        setStatus('error')
        setErrorMessage(error instanceof Error ? error.message : '保存失败')
      }
    })().catch((error: unknown) => {
      if (error instanceof Error) {
        setErrorMessage(error.message)
        setStatus('error')
      }
    })
  }, [handleSubmit, mergeMode, section, updateMutation, revalidator])

  const cancel = useCallback(() => {
    reset(initialValues)
    setMode('read')
    setStatus('idle')
    setErrorMessage(null)
    setOptimisticSource(null)
  }, [initialValues, reset])

  return {
    mode,
    setMode,
    form,
    save,
    cancel,
    isPending: updateMutation.isPending,
    status,
    errorMessage,
    optimisticSource,
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
