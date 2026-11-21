import type { SettingsSection } from '@kobato/settings/sections'
import type { SettingsSectionPatch } from '@kobato/settings/types'
import type { z } from 'zod'

import { zodIssueParams } from '@kobato/api/contracts/api-error'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { getLogger } from '@kobato/ui/lib/logger'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { useSettingsFlushContext } from '@kobato/web-admin/ui/settings/shell/SettingsFlushProvider'
import { useSettingsMutation } from '@kobato/web-admin/ui/settings/use-settings-mutation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type DefaultValues,
  type FieldError,
  type FieldErrors,
  type FieldPath,
  type FieldValues,
  type Resolver,
  type UseFormReturn,
  useForm,
} from 'react-hook-form'
import { toast } from 'sonner'

const log = getLogger('settings.card')

interface UseSettingsCardBaseOptions<TSource extends object, TState extends FieldValues> {
  source: TSource
  toState: (source: TSource) => TState
  schema?: z.ZodType<TState, any>
  onSaved?: (section: TSource) => void
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
  save: (field?: string) => Promise<boolean>
  flushOnBlur: () => void
  flush: () => Promise<boolean>
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
        current = unsafeCast<Record<string, unknown>>(stepped)
      }
    }
    const lastKey = pathKey(issue.path[issue.path.length - 1])
    current[lastKey] = { type: issue.code, message: issue.message } satisfies FieldError
  }
  return unsafeCast<FieldErrors<T>>(errors)
}

function firstErrorMessage(node: unknown): string | undefined {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = firstErrorMessage(item)
      if (found !== undefined) {
        return found
      }
    }
    return undefined
  }
  if (isRecord(node)) {
    if (typeof node.message === 'string') {
      return node.message
    }
    for (const value of Object.values(node)) {
      const found = firstErrorMessage(value)
      if (found !== undefined) {
        return found
      }
    }
  }
  return undefined
}

function getPathValue(values: unknown, path: string): unknown {
  let node = values
  for (const key of path.split('.')) {
    if (!isRecord(node) && !Array.isArray(node)) {
      return undefined
    }
    node = unsafeCast<Record<string, unknown>>(node)[key]
  }
  return node
}

function setPathValue(draft: unknown, path: string, value: unknown): void {
  const keys = path.split('.')
  let node = unsafeCast<Record<string, unknown>>(draft)
  for (const key of keys.slice(0, -1)) {
    node = unsafeCast<Record<string, unknown>>(node[key])
  }
  node[keys[keys.length - 1]!] = value
}

function sparseDiff(base: unknown, next: unknown): unknown {
  if (isRecord(base) && isRecord(next)) {
    const out: Record<string, unknown> = {}
    let changed = false
    for (const key of Object.keys(next)) {
      const diff = sparseDiff(base[key], next[key])
      if (diff !== undefined) {
        out[key] = diff
        changed = true
      }
    }
    return changed ? out : undefined
  }
  if (Array.isArray(base) || Array.isArray(next)) {
    return JSON.stringify(base) === JSON.stringify(next) ? undefined : next
  }
  return Object.is(base, next) ? undefined : next
}

export function useSettingsCard<TSource extends object, TState extends FieldValues>({
  section,
  source,
  toState,
  fromState,
  schema,
  onSaved,
}: UseSettingsCardOptions<TSource, TState>): UseSettingsCardResult<TSource, TState> {
  const [savedSource, setSavedSource] = useState<TSource | null>(null)
  const { commit, isPending, status } = useSettingsMutation()
  const { localizeMessage, t } = useI18n()
  const localizeIssues = useCallback(
    <Issue extends { message: string }>(issues: Issue[]): Issue[] =>
      issues.map((issue) => ({
        ...issue,
        message: localizeMessage(issue.message, zodIssueParams(issue)),
      })),
    [localizeMessage],
  )
  const { registerFlush } = useSettingsFlushContext()

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
      return { values: {}, errors: buildZodErrors<TState>(localizeIssues(result.error.issues)) }
    }
  }, [schema, localizeIssues])

  const form = useForm<TState>({
    defaultValues: initialValues,
    resolver,
    mode: 'onChange',
  })
  const { reset, handleSubmit, getValues, setValue } = form

  const [lastCommitted, setLastCommittedState] = useState<DefaultValues<TState>>(initialValues)
  const lastCommittedRef = useRef(lastCommitted)
  const setLastCommitted = useCallback((next: DefaultValues<TState>) => {
    lastCommittedRef.current = next
    setLastCommittedState(next)
  }, [])
  useEffect(() => {
    lastCommittedRef.current = lastCommitted
  }, [lastCommitted])

  const [lastSourceSnapshot, setLastSourceSnapshot] = useState<TSource>(source)
  if (source !== lastSourceSnapshot) {
    setLastSourceSnapshot(source)

    const currentValues = getValues()
    const hasUncommittedEdits = JSON.stringify(currentValues) !== JSON.stringify(lastCommitted)

    if (!hasUncommittedEdits) {
      const next = unsafeCast<DefaultValues<TState>>(toState(source))
      if (JSON.stringify(next) !== JSON.stringify(currentValues)) {
        reset(next)
        setLastCommittedState(next)
      }
      if (savedSource !== null) {
        setSavedSource(null)
      }
    }
  }

  const chainRef = useRef<Promise<void>>(Promise.resolve())
  const pendingRef = useRef<Promise<unknown> | null>(null)

  const runExclusive = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = chainRef.current.then(task, task)
    pendingRef.current = run
    chainRef.current = run.then(
      () => undefined,
      () => undefined,
    )
    const clear = () => {
      if (pendingRef.current === run) {
        pendingRef.current = null
      }
    }
    void run.then(clear, clear)
    return run
  }, [])

  const isDirty = useCallback(() => {
    return JSON.stringify(getValues()) !== JSON.stringify(lastCommittedRef.current)
  }, [getValues])

  const commitWhole = useCallback(
    (): Promise<boolean> =>
      runExclusive(async () => {
        const submittedRaw = unsafeCast<DefaultValues<TState>>(getValues())
        return new Promise<boolean>((resolve) => {
          void handleSubmit(
            async (values) => {
              try {
                const patch = sparseDiff(fromState(unsafeCast<TState>(lastCommittedRef.current)), fromState(values))
                if (patch === undefined) {
                  setLastCommitted(submittedRaw)
                  resolve(true)
                  return
                }
                const result = await commit(section, unsafeCast<SettingsSectionPatch<typeof section>>(patch))
                if (result.ok) {
                  const savedSection = unsafeCast<TSource>(result.section)
                  setSavedSource(savedSection)
                  setLastCommitted(submittedRaw)
                  onSaved?.(savedSection)
                  resolve(true)
                } else {
                  setSavedSource(null)
                  resolve(false)
                }
              } catch (error) {
                log.warn('settings save threw', { section, error })
                setSavedSource(null)
                resolve(false)
              }
            },
            (errors) => {
              toast.error(t('admin.settings.shell.unsavedTitle'), {
                description: firstErrorMessage(errors) ?? t('admin.settings.shell.unsavedDescription'),
              })
              log.debug('Settings save validation failed', { errors })
              resolve(false)
            },
          )()
        })
      }),
    [runExclusive, getValues, handleSubmit, fromState, commit, section, onSaved, setLastCommitted, t],
  )

  const revertField = useCallback(
    (field: string, base: DefaultValues<TState>, submitted: unknown) => {
      if (!Object.is(getPathValue(getValues(), field), submitted)) {
        return
      }
      setValue(unsafeCast<FieldPath<TState>>(field), unsafeCast<never>(getPathValue(base, field)))
    },
    [getValues, setValue],
  )

  const commitField = useCallback(
    (field: string): Promise<boolean> =>
      runExclusive(async () => {
        const base = lastCommittedRef.current
        const submitted = getPathValue(getValues(), field)
        const scoped = structuredClone(base)
        setPathValue(scoped, field, submitted)

        const patch = sparseDiff(fromState(unsafeCast<TState>(base)), fromState(unsafeCast<TState>(scoped)))
        if (patch === undefined) {
          return true
        }

        if (schema) {
          const result = await schema.safeParseAsync(scoped)
          if (!result.success) {
            revertField(field, base, submitted)
            toast.error(t('admin.settings.shell.unsavedTitle'), {
              description:
                firstErrorMessage(buildZodErrors<TState>(localizeIssues(result.error.issues))) ??
                t('admin.settings.shell.unsavedDescription'),
            })
            log.debug('Settings field save validation failed, rolled back', { field, errors: result.error.issues })
            return false
          }
        }

        try {
          const result = await commit(section, unsafeCast<SettingsSectionPatch<typeof section>>(patch))
          if (result.ok) {
            const savedSection = unsafeCast<TSource>(result.section)
            setSavedSource(savedSection)
            setLastCommitted(scoped)
            onSaved?.(savedSection)
            return true
          }
          revertField(field, base, submitted)
          setSavedSource(null)
          return false
        } catch (error) {
          log.warn('settings field save threw', { section, field, error })
          revertField(field, base, submitted)
          setSavedSource(null)
          return false
        }
      }),
    [
      runExclusive,
      schema,
      getValues,
      revertField,
      commit,
      section,
      fromState,
      onSaved,
      localizeIssues,
      t,
      setLastCommitted,
    ],
  )

  const save = useCallback(
    (field?: string): Promise<boolean> => {
      return field === undefined ? commitWhole() : commitField(field)
    },
    [commitWhole, commitField],
  )

  const FLUSH_MAX_ATTEMPTS = 3
  const flush = useCallback(async (): Promise<boolean> => {
    try {
      for (let attempt = 0; attempt < FLUSH_MAX_ATTEMPTS; attempt += 1) {
        const pending = pendingRef.current
        if (pending !== null) {
          const settled = await pending.then(
            (value: unknown) => value !== false,
            () => false,
          )
          if (!settled) {
            return false
          }
          continue
        }
        if (!isDirty()) {
          return true
        }
        if (!(await commitWhole())) {
          return false
        }
      }
      return !isDirty()
    } catch (error) {
      log.warn('settings flush threw', { section, error })
      return false
    }
  }, [commitWhole, isDirty, section])

  const flushOnBlur = useCallback(() => {
    if (!isDirty()) {
      return
    }
    void commitWhole().catch((error: unknown) => {
      log.warn('settings blur flush threw', { section, error })
    })
  }, [isDirty, commitWhole, section])

  useEffect(() => {
    return registerFlush(section, flush)
  }, [registerFlush, section, flush])

  return {
    form,
    isSaving: isPending,
    save,
    flushOnBlur,
    flush,
    display: savedSource ?? source,
    settingGroupProps: {
      saveState: status,
    },
  }
}
