import type { z } from 'zod'

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

import type { SettingsSection } from '@/shared/config/sections'
import type { SettingsSectionPatch } from '@/shared/config/types'

import { getLogger } from '@/client/lib/logger'
import { unsafeCast } from '@/shared/utils/unsafe-cast'
import { zodIssueParams } from '@/shared/utils/zod-issue-bounds'
import { useSettingsFlushContext } from '@/ui/admin/settings/shell/SettingsFlushProvider'
import { useSettingsMutation } from '@/ui/admin/settings/useSettingsMutation'
import { useI18n } from '@/ui/lib/I18nProvider'

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
  /** Immediate commit, skipping the dirty guard; a field name scopes it to that
   *  field and rolls it back on rejection. */
  save: (field?: string) => Promise<boolean>
  /** Blur-driven commit; no-op when the form matches the last committed snapshot. */
  flushOnBlur: () => void
  /** Awaitable whole-card flush: true only when the card is clean afterwards, never resets unsaved input. */
  flush: () => Promise<boolean>
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

// Field-scoped commit patch: baseline with only this field replaced by its current form value.
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
  const { localizeMessage, t } = useI18n()
  // Zod messages may be catalog ids (typed at the schema call site) or Zod's own
  // prose; translate the ids and leave the prose. Runs BEFORE `buildZodErrors` so
  // a raw id can never reach a field error.
  const localizeIssues = useCallback(
    <Issue extends { message: string }>(issues: Issue[]): Issue[] =>
      issues.map((issue) => ({
        ...issue,
        message: localizeMessage(issue.message, zodIssueParams(issue)),
      })),
    [localizeMessage],
  )
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
      return { values: {}, errors: buildZodErrors<TState>(localizeIssues(result.error.issues)) }
    }
  }, [schema, localizeIssues])

  const form = useForm<TState>({
    defaultValues: initialValues,
    resolver,
    mode: 'onChange',
  })
  const { reset, handleSubmit, getValues, setValue } = form

  // Last acknowledged snapshot in RAW form-value representation — drives the
  // dirty guard; resolver-parsed values would break under `.trim()`-style transforms.
  const [lastCommitted, setLastCommittedState] = useState<DefaultValues<TState>>(initialValues)
  // Mirror for async chains: a flush loop must see the baseline a just-resolved
  // commit wrote, not the render-time state captured in this closure.
  const lastCommittedRef = useRef(lastCommitted)
  const setLastCommitted = useCallback((next: DefaultValues<TState>) => {
    lastCommittedRef.current = next
    setLastCommittedState(next)
  }, [])
  // Keep the async-chain mirror in step with state written outside the callbacks
  // (the render-time re-seed below). Effects flush before the next user event.
  useEffect(() => {
    lastCommittedRef.current = lastCommitted
  }, [lastCommitted])

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
        setLastCommittedState(next)
      }
      if (savedSource !== null) {
        setSavedSource(null)
      }
    }
  }

  // Per-card serialization: every commit runs through ONE promise chain, so
  // responses apply in order and a stale response never advances the baseline
  // past a newer commit. `pendingRef` lets a flush wait for a field-scoped
  // save, then re-check the remaining dirty fields.
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

  /**
   * Commit the whole card. A failed commit — validation, rejection or throw —
   * NEVER resets the form: the dirty input and its error stay on screen so the
   * retry can succeed.
   *
   * The POST is a sparse diff against the last acknowledged baseline: the card
   * shares its section with sibling cards and other tabs, so re-sending an
   * untouched owned field would write a stale copy over a newer value.
   */
  const commitWhole = useCallback(
    (): Promise<boolean> =>
      runExclusive(async () => {
        // Capture the exact values being submitted; NEW input typed during the
        // round trip must stay dirty afterwards (never marked clean by a late
        // `getValues()`).
        const submittedRaw = unsafeCast<DefaultValues<TState>>(getValues())
        return new Promise<boolean>((resolve) => {
          void handleSubmit(
            async (values) => {
              try {
                // Resolver-parsed values on the submitted side keep the patch
                // normalized (trim and friends).
                const patch = sparseDiff(fromState(unsafeCast<TState>(lastCommittedRef.current)), fromState(values))
                if (patch === undefined) {
                  // Everything this card owns maps to its committed value
                  // (the raw edit differed only before `fromState`'s
                  // normalization) — mark it acknowledged, POST nothing.
                  setLastCommitted(submittedRaw)
                  resolve(true)
                  return
                }
                const result = await commit(section, unsafeCast<SettingsSectionPatch<typeof section>>(patch))
                if (result.ok) {
                  // Server-produced TSource (masks merged in) — same shape the loader feeds this card as `source`.
                  const savedSection = unsafeCast<TSource>(result.section)
                  setSavedSource(savedSection)
                  // The baseline advances to the CAPTURED submitted values, never
                  // to the response: a response field this card did not submit
                  // must not leak into the form, while input typed during the
                  // round trip stays dirty for the next flush.
                  setLastCommitted(submittedRaw)
                  onSaved?.(savedSection)
                  resolve(true)
                } else {
                  // Keep the form dirty so the next flush retries; display falls back to the loader snapshot.
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
              // A rejected save must never be silent — surface the first issue,
              // but keep the values: resetting here silently swallows the draft.
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

  /**
   * A discrete control is authoritative only once the server acknowledges it:
   * roll the field back to its committed value after a rejection — unless the
   * admin edited it again mid-flight.
   */
  const revertField = useCallback(
    (field: string, base: DefaultValues<TState>, submitted: unknown) => {
      if (!Object.is(getPathValue(getValues(), field), submitted)) {
        return
      }
      setValue(unsafeCast<FieldPath<TState>>(field), unsafeCast<never>(getPathValue(base, field)))
    },
    [getValues, setValue],
  )

  // Field-scoped commit: POST only the trigger field's change, advance only its
  // baseline, roll back only it on rejection.
  const commitField = useCallback(
    (field: string): Promise<boolean> =>
      runExclusive(async () => {
        const base = lastCommittedRef.current
        const submitted = getPathValue(getValues(), field)
        const scoped = structuredClone(base)
        setPathValue(scoped, field, submitted)

        const patch = sparseDiff(fromState(unsafeCast<TState>(base)), fromState(unsafeCast<TState>(scoped)))
        if (patch === undefined) {
          // Control fired without the value moving (a re-select) — nothing to commit.
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
            // Only the trigger field's baseline advances — siblings stay dirty for their own flush.
            setLastCommitted(scoped)
            onSaved?.(savedSection)
            return true
          }
          // A rejected discrete value must not render as persisted, and must
          // not ride the next whole-card flush.
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

  /**
   * Panel flush: wait out a control-triggered save, then keep committing until
   * the card is clean. Bounded retries — an admin typing nonstop during the
   * round trips reports false, so the locale switch never reloads with unsaved
   * edits.
   */
  const FLUSH_MAX_ATTEMPTS = 3
  const flush = useCallback(async (): Promise<boolean> => {
    try {
      for (let attempt = 0; attempt < FLUSH_MAX_ATTEMPTS; attempt += 1) {
        const pending = pendingRef.current
        if (pending !== null) {
          // A field-only save may have been in flight; wait for it, then
          // re-check the OTHER dirty fields instead of assuming the card is clean.
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

  // Text-input blur — skip when nothing changed. Fire-and-forget for listeners
  // that cannot await; a validation failure keeps the invalid input on screen
  // (see `commitWhole`).
  const flushOnBlur = useCallback(() => {
    if (!isDirty()) {
      return
    }
    void commitWhole().catch((error: unknown) => {
      log.warn('settings blur flush threw', { section, error })
    })
  }, [isDirty, commitWhole, section])

  // Register the AWAITABLE flush so panel triggers (close, scroll, page-hide)
  // keep their fire-and-forget wrapper in the provider, while the locale switch
  // can wait for the honest result.
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
