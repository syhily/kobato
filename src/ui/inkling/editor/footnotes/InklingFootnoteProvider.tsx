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
  openInsertDialog: (targetKey?: string) => void
  openEditDialog: (targetKey: string) => void
  closeDialog: () => void
  syncFromDocument: (document: InklingDocument) => void
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

export function InklingFootnoteProvider({ children, initialDefinitions = [] }: InklingFootnoteProviderProps) {
  const [definitions, setDefinitions] = useState<readonly FootnoteDefinitionItem[]>(initialDefinitions)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [dialogInitialChildren, setDialogInitialChildren] = useState<InklingNonRecursiveBlockNode[]>([EMPTY_PARAGRAPH])
  const [editTargetKey, setEditTargetKey] = useState<string | null>(null)

  const openInsertDialog = useCallback((targetKey?: string) => {
    setEditTargetKey(targetKey ?? null)
    setDialogMode('create')
    setDialogInitialChildren([EMPTY_PARAGRAPH])
    setDialogOpen(true)
  }, [])

  const openEditDialog = useCallback(
    (targetKey: string) => {
      const def = definitions.find((d) => d.targetKey === targetKey)
      setEditTargetKey(targetKey)
      setDialogMode('edit')
      setDialogInitialChildren(def !== undefined && def.children.length > 0 ? [...def.children] : [EMPTY_PARAGRAPH])
      setDialogOpen(true)
    },
    [definitions],
  )

  const closeDialog = useCallback(() => {
    setDialogOpen(false)
    setEditTargetKey(null)
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
