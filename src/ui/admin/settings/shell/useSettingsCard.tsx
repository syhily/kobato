import type { z } from 'zod'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
  /** Called with the authoritative save response after every successful commit — for parents that react to a saved field. */
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
  /** Immediate commit (skips the dirty guard, still validates). With a field
   *  name, only that field's change is POSTed and only its baseline advances. */
  save: (field?: string) => void
  /** Blur-driven commit; no-op when the form matches the last committed snapshot. */
  flushOnBlur: () => void
  /** Latest server-confirmed section (save response), falling back to the loader snapshot. Never POSTed. */
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

// Zod issue paths are PropertyKey[]; RHF error trees key by string — coerce via `String()`.
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
        // Walked into an array slot / primitive that earlier issues materialized — treat as a record.
        current = unsafeCast<Record<string, unknown>>(stepped)
      }
    }
    const lastKey = pathKey(issue.path[issue.path.length - 1])
    current[lastKey] = { type: issue.code, message: issue.message } satisfies FieldError
  }
  // Structural cast — the hand-built tree mirrors FieldErrors<T> one leaf at a time.
  return unsafeCast<FieldErrors<T>>(errors)
}

// First human-readable issue in an RHF error tree, so a rejected save names the failing field.
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

// Field-scoped commits (P1-13): `save(field)` POSTs only that field — the
// patch is the sparse diff of the baseline vs the baseline with this field
// replaced by its current form value.
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

/** Immutable-shape write of a dotted RHF field path (mutates a draft clone). */
function setPathValue(draft: unknown, path: string, value: unknown): void {
  const keys = path.split('.')
  let node = unsafeCast<Record<string, unknown>>(draft)
  for (const key of keys.slice(0, -1)) {
    node = unsafeCast<Record<string, unknown>>(node[key])
  }
  node[keys[keys.length - 1]!] = value
}

/** Sparse deep-diff: subset of `next` differing from `base`, or undefined.
 *  Arrays compare atomically — the server's deep-merge treats them as replace. */
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
  const { registerFlush } = useSettingsFlushContext()

  // `toState` returns TState; DefaultValues<TState> is wider (allows `undefined` leaves).
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
  const { reset, handleSubmit, getValues, setValue } = form

  // Last acknowledged snapshot in RAW form-value representation — drives the
  // dirty guard; resolver-parsed values would break under `.trim()`-style transforms.
  const [lastCommitted, setLastCommitted] = useState<DefaultValues<TState>>(initialValues)

  // Re-seed when source changes (navigation back, remote edit) — only when
  // clean: a fresh reference with identical content must not reset in-flight edits.
  const [lastSourceSnapshot, setLastSourceSnapshot] = useState<TSource>(source)
  if (source !== lastSourceSnapshot) {
    setLastSourceSnapshot(source)

    const currentValues = getValues()
    const hasUncommittedEdits = JSON.stringify(currentValues) !== JSON.stringify(lastCommitted)

    if (!hasUncommittedEdits) {
      const next = unsafeCast<DefaultValues<TState>>(toState(source))
      // Skip the reset when the incoming snapshot maps to the same state —
      // `reset()` remounts useFieldArray rows and drops focus / caret.
      if (JSON.stringify(next) !== JSON.stringify(currentValues)) {
        reset(next)
        setLastCommitted(next)
      }
      if (savedSource !== null) {
        setSavedSource(null)
      }
    }
    // Dirty — keep the edits; the pending flush will commit them.
  }

  const performSave = useCallback(() => {
    void handleSubmit(
      async (values) => {
        // The card posts its honest Section patch — only owned fields; the
        // server deep-merges and the response becomes the new baseline.
        const patchPayload = fromState(values)
        const result = await commit(section, patchPayload)
        if (result.ok) {
          // Server-produced TSource (masks merged in) — same shape the loader feeds this card as `source`.
          const savedSection = unsafeCast<TSource>(result.section)
          setSavedSource(savedSection)
          // Baseline moves to the RAW form values, not the resolver-parsed `values`.
          setLastCommitted(unsafeCast<DefaultValues<TState>>(getValues()))
          onSaved?.(savedSection)
        } else {
          // Keep the form dirty so the next flush retries; display falls back to the loader snapshot.
          setSavedSource(null)
        }
      },
      (errors) => {
        // A rejected save must never be silent — roll back to the last
        // committed snapshot and surface the first issue.
        reset(lastCommitted)
        toast.error('设置未保存', { description: firstErrorMessage(errors) ?? '请检查输入后重试' })
        log.debug('Settings save validation failed, rolled back', { errors })
      },
    )()
  }, [handleSubmit, section, commit, fromState, getValues, reset, lastCommitted, onSaved])

  const isDirty = useCallback(() => {
    return JSON.stringify(getValues()) !== JSON.stringify(lastCommitted)
  }, [getValues, lastCommitted])

  // Field-scoped commit (P1-13): POST only the trigger field's change,
  // advance only its baseline, roll back only it on rejection.
  const performSaveField = useCallback(
    (field: string) => {
      void (async () => {
        const scoped = structuredClone(lastCommitted)
        setPathValue(scoped, field, getPathValue(getValues(), field))

        const patch = sparseDiff(fromState(unsafeCast<TState>(lastCommitted)), fromState(unsafeCast<TState>(scoped)))
        if (patch === undefined) {
          // Control fired without the value moving (a re-select) — nothing to commit.
          return
        }

        if (schema) {
          const result = await schema.safeParseAsync(scoped)
          if (!result.success) {
            setValue(unsafeCast<FieldPath<TState>>(field), unsafeCast<never>(getPathValue(lastCommitted, field)))
            toast.error('设置未保存', {
              description: firstErrorMessage(buildZodErrors<TState>(result.error.issues)) ?? '请检查输入后重试',
            })
            log.debug('Settings field save validation failed, rolled back', { field, errors: result.error.issues })
            return
          }
        }

        const result = await commit(section, unsafeCast<SettingsSectionPatch<typeof section>>(patch))
        if (result.ok) {
          const savedSection = unsafeCast<TSource>(result.section)
          setSavedSource(savedSection)
          // Only the trigger field's baseline advances — siblings stay dirty for their own flush.
          setLastCommitted(scoped)
          onSaved?.(savedSection)
        } else {
          setSavedSource(null)
        }
      })()
    },
    [lastCommitted, getValues, setValue, schema, commit, section, fromState, onSaved],
  )

  // Discrete controls fire immediately; a field name scopes the commit to that field.
  const save = useCallback(
    (field?: string) => {
      if (field === undefined) {
        performSave()
        return
      }
      performSaveField(field)
    },
    [performSave, performSaveField],
  )

  // Text-input blur — skip when nothing changed; also the panel flush registry's callback.
  const flushOnBlur = useCallback(() => {
    if (!isDirty()) {
      return
    }
    performSave()
  }, [isDirty, performSave])

  // Register this card's flush so panel-level triggers (close, scroll, page-hide) can reach it.
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
