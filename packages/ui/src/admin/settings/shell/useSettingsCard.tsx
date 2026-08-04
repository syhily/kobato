import type { SettingsSection } from '@kobato/shared/config/sections'
import type { SettingsSectionPatch } from '@kobato/shared/config/types'
import type { z } from 'zod'

import { getLogger } from '@kobato/client/lib/logger'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { useSettingsFlushContext } from '@kobato/ui/admin/settings/shell/SettingsFlushProvider'
import { useSettingsMutation } from '@kobato/ui/admin/settings/useSettingsMutation'
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

const log = getLogger('settings.card')

interface UseSettingsCardBaseOptions<TSource extends object, TState extends FieldValues> {
  source: TSource
  toState: (source: TSource) => TState
  schema?: z.ZodType<TState, any>
  /** Called with the authoritative save response (same shape as `source`)
   * after every successful commit — for parents that must react to a saved
   * field without waiting on a loader revalidate (which saves never trigger). */
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
  /** Immediate commit. Skips the dirty guard but still runs validation.
   * Used by Switch / RadioGroup / Select — controls that have no "intermediate"
   * state worth deferring. Pass the control's RHF field name (`save('enabled')`)
   * for a FIELD-scoped commit: only that field's change is POSTed and only that
   * field's baseline advances, so a keyboard-triggered toggle (no blur, no
   * mouse) can never sweep a sibling's half-typed text into the patch. */
  save: (field?: string) => void
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

// Zod issue paths are PropertyKey[] (string | number | symbol); RHF error
// trees key by string, so coerce every path element via `String()` — the
// narrowing is total since every PropertyKey has a well-defined string form.
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
        // materialised; treat it as a record (every prior iteration wrote a
        // container, so the runtime shape is already correct).
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

// Depth-first walk for the first human-readable issue in an RHF error tree
// (plain records and useFieldArray arrays), so a rejected save can tell the
// user WHICH field failed instead of just that something did.
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

// ─── Field-scoped commit helpers (P1-13) ─────────────────
// A discrete control (switch / select / radio / checkbox / combobox)
// fires `save(field)`; the commit must carry ONLY that field's change,
// so the patch is computed as the sparse diff between two `fromState`
// snapshots: the committed baseline and the baseline with just this
// field replaced by its current form value.

/** Read a dotted RHF field path out of a plain values object. */
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

/**
 * Sparse deep-diff: returns the subset of `next` that differs from
 * `base`, or undefined when nothing changed. Objects recurse; arrays and
 * primitives compare atomically (a changed array is POSTed whole — the
 * server's deep-merge treats arrays as replace, not merge). Keys only
 * present in `base` never appear (settings states don't delete keys).
 */
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
  const { reset, handleSubmit, getValues, setValue } = form

  // Last snapshot the server has acknowledged (or the initial seed), kept in
  // RAW form-value representation. Drives the dirty guard: if `getValues()`
  // deep-equals this, flush is a no-op. Storing the raw values (rather than
  // the resolver-parsed output) keeps both sides of the comparison in one
  // representation — a schema transform such as `.trim()` would otherwise
  // leave the card permanently dirty and re-POST on every flush.
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
          const savedSection = unsafeCast<TSource>(result.section)
          setSavedSource(savedSection)
          // Baseline moves to the RAW form values (see `lastCommitted`
          // above), not the resolver-parsed `values` this callback receives.
          setLastCommitted(unsafeCast<DefaultValues<TState>>(getValues()))
          onSaved?.(savedSection)
        } else {
          // Keep the form dirty (lastCommitted untouched) so the next
          // flush retries; display falls back to the loader snapshot.
          setSavedSource(null)
        }
      },
      (errors) => {
        // A rejected save must never be silent: the control would otherwise
        // keep the invalid value while the user believes it persisted. Roll
        // back to the last committed snapshot and surface the first issue —
        // same toast convention as `useSettingsMutation`'s network failure.
        reset(lastCommitted)
        toast.error('设置未保存', { description: firstErrorMessage(errors) ?? '请检查输入后重试' })
        log.debug('Settings save validation failed, rolled back', { errors })
      },
    )()
  }, [handleSubmit, section, commit, fromState, getValues, reset, lastCommitted, onSaved])

  const isDirty = useCallback(() => {
    return JSON.stringify(getValues()) !== JSON.stringify(lastCommitted)
  }, [getValues, lastCommitted])

  // Field-scoped commit for discrete controls (P1-13): POST only the
  // trigger field's change, advance only its baseline, and on rejection
  // roll back only it — a keyboard-fired toggle must neither sweep a
  // sibling's half-typed text into the patch nor clobber it on rollback,
  // and a sibling's invalid in-flight text must not block the toggle.
  const performSaveField = useCallback(
    (field: string) => {
      void (async () => {
        // The scoped state: committed baseline with just this field
        // replaced by its current form value.
        const scoped = structuredClone(lastCommitted)
        setPathValue(scoped, field, getPathValue(getValues(), field))

        const patch = sparseDiff(fromState(unsafeCast<TState>(lastCommitted)), fromState(unsafeCast<TState>(scoped)))
        if (patch === undefined) {
          // The control fired without the value actually moving (a
          // re-select of the current option) — nothing to commit.
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
          // Only the trigger field's baseline advances — sibling edits
          // stay dirty for their own blur / panel flush.
          setLastCommitted(scoped)
          onSaved?.(savedSection)
        } else {
          setSavedSource(null)
        }
      })()
    },
    [lastCommitted, getValues, setValue, schema, commit, section, fromState, onSaved],
  )

  // Switch / RadioGroup / Select / list buttons — fire immediately. A
  // field name scopes the commit to that field; without one the whole
  // card commits (list mutations and other composite edits).
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
