import type { ReactNode } from 'react'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'

import type { InklingDocument, InklingNonRecursiveBlockNode } from '@/shared/inkling/schema'

export interface FootnoteDefinitionItem {
  targetKey: string
  index: number
  children: InklingNonRecursiveBlockNode[]
}

export interface InklingFootnoteContextValue {
  definitions: readonly FootnoteDefinitionItem[]
  dialogOpen: boolean
  dialogMode: 'create' | 'edit'
  dialogInitialChildren: InklingNonRecursiveBlockNode[]
  editTargetKey: string | null
  openInsertDialog: () => void
  openEditDialog: (targetKey: string) => void
  closeDialog: () => void
  insertDefinition: (children: InklingNonRecursiveBlockNode[]) => FootnoteDefinitionItem | null
  updateDefinition: (targetKey: string, children: InklingNonRecursiveBlockNode[]) => boolean
  removeDefinition: (targetKey: string) => boolean
  syncFromDocument: (document: InklingDocument) => void
}

const InklingFootnoteContext = createContext<InklingFootnoteContextValue | null>(null)

export interface InklingFootnoteProviderProps {
  children: ReactNode
  initialDefinitions?: readonly FootnoteDefinitionItem[]
}

function generateFootnoteKey(): string {
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

export function InklingFootnoteProvider({ children, initialDefinitions = [] }: InklingFootnoteProviderProps) {
  const [definitions, setDefinitions] = useState<readonly FootnoteDefinitionItem[]>(initialDefinitions)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [dialogInitialChildren, setDialogInitialChildren] = useState<InklingNonRecursiveBlockNode[]>([])
  const [editTargetKey, setEditTargetKey] = useState<string | null>(null)

  const openInsertDialog = useCallback(() => {
    setEditTargetKey(null)
    setDialogMode('create')
    setDialogInitialChildren([
      {
        type: 'paragraph',
        version: 1,
        direction: null,
        format: '',
        indent: 0,
        children: [],
      },
    ])
    setDialogOpen(true)
  }, [])

  const openEditDialog = useCallback(
    (targetKey: string) => {
      const def = definitions.find((d) => d.targetKey === targetKey)
      setEditTargetKey(targetKey)
      setDialogMode('edit')
      setDialogInitialChildren(
        def !== undefined && def.children.length > 0
          ? [...def.children]
          : [
              {
                type: 'paragraph',
                version: 1,
                direction: null,
                format: '',
                indent: 0,
                children: [],
              },
            ],
      )
      setDialogOpen(true)
    },
    [definitions],
  )

  const closeDialog = useCallback(() => {
    setDialogOpen(false)
    setEditTargetKey(null)
  }, [])

  const insertDefinition = useCallback((children: InklingNonRecursiveBlockNode[]): FootnoteDefinitionItem | null => {
    const targetKey = generateFootnoteKey()
    let newDef: FootnoteDefinitionItem | null = null
    setDefinitions((prev) => {
      const nextIndex = prev.length + 1
      newDef = { targetKey, index: nextIndex, children: [...children] }
      return [...prev, newDef]
    })
    return newDef
  }, [])

  const updateDefinition = useCallback((targetKey: string, children: InklingNonRecursiveBlockNode[]): boolean => {
    let found = false
    setDefinitions((prev) =>
      prev.map((d) => {
        if (d.targetKey !== targetKey) {
          return d
        }
        found = true
        return { ...d, children: [...children] }
      }),
    )
    return found
  }, [])

  const removeDefinition = useCallback((targetKey: string): boolean => {
    let found = false
    setDefinitions((prev) => {
      const filtered = prev.filter((d) => {
        if (d.targetKey === targetKey) {
          found = true
          return false
        }
        return true
      })
      if (!found) {
        return prev
      } // Renumber remaining definitions sequentially.
      return filtered.map((d, i) => ({ ...d, index: i + 1 }))
    })
    return found
  }, [])

  const syncFromDocument = useCallback((document: InklingDocument) => {
    const defs: FootnoteDefinitionItem[] = []
    for (const block of document.root.children) {
      if (block.type === 'footnote-definition') {
        defs.push({ targetKey: block.targetKey, index: block.index, children: [...block.children] })
      }
    }
    setDefinitions(defs)
  }, [])

  const value = useMemo<InklingFootnoteContextValue>(
    () => ({
      definitions,
      dialogOpen,
      dialogMode,
      dialogInitialChildren,
      editTargetKey,
      openInsertDialog,
      openEditDialog,
      closeDialog,
      insertDefinition,
      updateDefinition,
      removeDefinition,
      syncFromDocument,
    }),
    [
      definitions,
      dialogOpen,
      dialogMode,
      dialogInitialChildren,
      editTargetKey,
      openInsertDialog,
      openEditDialog,
      closeDialog,
      insertDefinition,
      updateDefinition,
      removeDefinition,
      syncFromDocument,
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
