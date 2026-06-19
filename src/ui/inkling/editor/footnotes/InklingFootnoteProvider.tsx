import type { ReactNode } from 'react'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import type { InklingFootnoteRefEntry } from '@/shared/inkling/footnotes'
import type { InklingNonRecursiveBlockNode } from '@/shared/inkling/schema'

export interface FootnoteDefinitionItem {
  targetKey: string
  index: number
  children: InklingNonRecursiveBlockNode[]
}

export interface InklingFootnoteContextValue {
  /** Canonical definitions (rendered sorted by index in the context value). */
  definitions: readonly FootnoteDefinitionItem[]
  /** Live ref mirror — read this inside Lexical update listeners / callbacks
   *  to avoid stale closures. The array identity is stable between renders;
   *  only its contents change when `setDefinitionsRef` runs. */
  definitionsRef: React.RefObject<readonly FootnoteDefinitionItem[]>
  /** Stable getter for the current definitions; safe to call from event
   *  handlers and Lexical plugins. */
  getDefinitions: () => readonly FootnoteDefinitionItem[]
  dialogOpen: boolean
  dialogMode: 'create' | 'edit'
  dialogInitialChildren: InklingNonRecursiveBlockNode[]
  editTargetKey: string | null
  openInsertDialog: (targetKey?: string) => void
  openEditDialog: (targetKey: string) => void
  closeDialog: () => void
  /** Insert or replace a definition body. Used by the dialog save handler
   *  for both create and edit modes. Does NOT touch the editor tree. */
  replaceDefinition: (targetKey: string, children: readonly InklingNonRecursiveBlockNode[]) => void
  /** Remove a definition by targetKey (dialog delete button). Does NOT touch
   *  the editor tree — the caller is responsible for removing matching refs. */
  removeDefinition: (targetKey: string) => void
  /** Drop definitions that have no matching ref. Called by the editor update
   *  listener on every edit so orphans never persist (per §6.3 / design
   *  decision: auto-delete orphans). Returns the survivor count so the caller
   *  can decide whether to re-render. */
  removeOrphans: (refs: readonly InklingFootnoteRefEntry[]) => number
}

const InklingFootnoteContext = createContext<InklingFootnoteContextValue | null>(null)

export function generateFootnoteKey(): string {
  const bytes = new Uint8Array(8)
  if (typeof globalThis !== 'undefined' && typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  let out = ''
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(36).padStart(2, '0')
  }
  return out.slice(0, 12)
}

export interface InklingFootnoteProviderProps {
  children: ReactNode
  initialDefinitions?: readonly FootnoteDefinitionItem[]
}

const EMPTY_PARAGRAPH: InklingNonRecursiveBlockNode = {
  type: 'paragraph',
  version: 1,
  direction: null,
  format: '',
  indent: 0,
  children: [],
}

/**
 * Re-derive 1-based indices from the first-reference order in `refs`, then
 * apply them to `definitions`. Definitions whose targetKey never appears in
 * `refs` are dropped (caller should have already removed orphans, but this is
 * a defensive belt-and-braces).
 *
 * This mirrors the canonicalisation done by `synchronizeInklingFootnoteIndices`
 * in `shared/inkling/footnotes.ts` but operates on the provider's parallel
 * state rather than a full InklingDocument. Indices on the refs themselves are
 * the editor listener's responsibility (it rewrites them in the Lexical tree).
 */
function renumberDefinitions(
  definitions: readonly FootnoteDefinitionItem[],
  refs: readonly InklingFootnoteRefEntry[],
): FootnoteDefinitionItem[] {
  const seen = new Set<string>()
  const order: string[] = []
  for (const ref of refs) {
    if (seen.has(ref.targetKey)) {
      continue
    }
    seen.add(ref.targetKey)
    order.push(ref.targetKey)
  }
  // Keep orphans in their existing relative order at the tail. The caller
  // (removeOrphans) usually drops them first, but replaceDefinition can
  // transiently create an orphan before the ref is inserted.
  for (const def of definitions) {
    if (!seen.has(def.targetKey)) {
      seen.add(def.targetKey)
      order.push(def.targetKey)
    }
  }

  const byKey = new Map(definitions.map((d) => [d.targetKey, d]))
  const keyToIndex = new Map(order.map((targetKey, i) => [targetKey, i + 1]))

  return order.map((targetKey) => {
    const existing = byKey.get(targetKey)
    const index = keyToIndex.get(targetKey) ?? 0
    if (existing === undefined) {
      return { targetKey, index, children: [EMPTY_PARAGRAPH] }
    }
    return existing.index === index ? existing : { ...existing, index }
  })
}

export function InklingFootnoteProvider({ children, initialDefinitions = [] }: InklingFootnoteProviderProps) {
  const [definitions, setDefinitionsState] = useState<readonly FootnoteDefinitionItem[]>(() =>
    initialDefinitions.map((d) => ({ ...d, children: [...d.children] })),
  )
  // Ref mirror — listeners read this to dodge stale closures.
  const definitionsRef = useRef<readonly FootnoteDefinitionItem[]>(definitions)
  useEffect(() => {
    definitionsRef.current = definitions
  }, [definitions])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [dialogInitialChildren, setDialogInitialChildren] = useState<InklingNonRecursiveBlockNode[]>([EMPTY_PARAGRAPH])
  const [editTargetKey, setEditTargetKey] = useState<string | null>(null)

  const setDefinitions = useCallback(
    (
      next:
        | readonly FootnoteDefinitionItem[]
        | ((prev: readonly FootnoteDefinitionItem[]) => readonly FootnoteDefinitionItem[]),
    ) => {
      // Compute synchronously off the ref mirror (which we keep up to date
      // below) so callers reading `getDefinitions()` in the same tick — e.g.
      // the editor update listener right after `removeOrphans` — see the new
      // value. React's `setState` updater runs lazily during render, so we
      // can't rely on it for the mirror.
      const prev = definitionsRef.current
      const computed = typeof next === 'function' ? next(prev) : next
      definitionsRef.current = computed
      setDefinitionsState(computed)
    },
    [],
  )

  const openInsertDialog = useCallback((targetKey?: string) => {
    setEditTargetKey(targetKey ?? null)
    setDialogMode('create')
    setDialogInitialChildren([EMPTY_PARAGRAPH])
    setDialogOpen(true)
  }, [])

  const openEditDialog = useCallback((targetKey: string) => {
    const def = definitionsRef.current.find((d) => d.targetKey === targetKey)
    setEditTargetKey(targetKey)
    setDialogMode('edit')
    setDialogInitialChildren(def !== undefined && def.children.length > 0 ? [...def.children] : [EMPTY_PARAGRAPH])
    setDialogOpen(true)
  }, [])

  const closeDialog = useCallback(() => {
    setDialogOpen(false)
    setEditTargetKey(null)
  }, [])

  const replaceDefinition = useCallback(
    (targetKey: string, children: readonly InklingNonRecursiveBlockNode[]) => {
      // Insert/replace without renumbering — the editor update listener owns
      // index derivation. We preserve existing index if present, else 0 (the
      // listener will renumber on the next update).
      setDefinitions((prev) => {
        const without = prev.filter((d) => d.targetKey !== targetKey)
        const existing = prev.find((d) => d.targetKey === targetKey)
        return [...without, { targetKey, index: existing?.index ?? 0, children: [...children] }]
      })
    },
    [setDefinitions],
  )

  const removeDefinition = useCallback(
    (targetKey: string) => {
      setDefinitions((prev) => prev.filter((d) => d.targetKey !== targetKey))
    },
    [setDefinitions],
  )

  const removeOrphans = useCallback(
    (refs: readonly InklingFootnoteRefEntry[]) => {
      const referenced = new Set(refs.map((r) => r.targetKey))
      let removed = 0
      setDefinitions((prev) => {
        const next = prev.filter((d) => {
          if (!referenced.has(d.targetKey)) {
            removed += 1
            return false
          }
          return true
        })
        if (removed === 0) {
          // No orphans — but indices may still need refreshing. Only return a
          // new array if a renumber actually changes something, otherwise bail
          // with the original reference so React skips the re-render.
          const renumbered = renumberDefinitions(prev, refs)
          const indicesChanged = renumbered.some(
            (d, i) => prev[i]?.index !== d.index || prev[i]?.targetKey !== d.targetKey,
          )
          return indicesChanged ? renumbered : prev
        }
        // Renumber survivors by first-ref order.
        return renumberDefinitions(next, refs)
      })
      return removed
    },
    [setDefinitions],
  )

  const getDefinitions = useCallback(() => definitionsRef.current, [])

  const value = useMemo<InklingFootnoteContextValue>(
    () => ({
      definitions,
      definitionsRef,
      getDefinitions,
      dialogOpen,
      dialogMode,
      dialogInitialChildren,
      editTargetKey,
      openInsertDialog,
      openEditDialog,
      closeDialog,
      replaceDefinition,
      removeDefinition,
      removeOrphans,
    }),
    [
      definitions,
      definitionsRef,
      getDefinitions,
      dialogOpen,
      dialogMode,
      dialogInitialChildren,
      editTargetKey,
      openInsertDialog,
      openEditDialog,
      closeDialog,
      replaceDefinition,
      removeDefinition,
      removeOrphans,
    ],
  )

  return <InklingFootnoteContext.Provider value={value}>{children}</InklingFootnoteContext.Provider>
}

export function useInklingFootnotes(): InklingFootnoteContextValue {
  const ctx = useContext(InklingFootnoteContext)
  if (ctx === null) {
    throw new Error('useInklingFootnotes must be used inside <InklingFootnoteProvider>')
  }
  return ctx
}
