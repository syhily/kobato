import { useCallback, useRef, useState } from 'react'

import type { InklingNonRecursiveBlockNode } from '@/shared/inkling/schema'

import { NestedInklingEditor } from '@/ui/inkling/editor/nested/NestedEditor'

export interface FootnoteDialogProps {
  open: boolean
  mode: 'create' | 'edit'
  initialChildren: InklingNonRecursiveBlockNode[]
  index: number
  onSave: (children: InklingNonRecursiveBlockNode[]) => void
  onDelete: () => void
  onClose: () => void
}

export function FootnoteDialog({ open, mode, initialChildren, index, onSave, onDelete, onClose }: FootnoteDialogProps) {
  if (!open) {
    return null
  }
  return (
    <FootnoteDialogContent
      key={`${mode}-${index}`}
      mode={mode}
      initialChildren={initialChildren}
      index={index}
      onSave={onSave}
      onDelete={onDelete}
      onClose={onClose}
    />
  )
}

function FootnoteDialogContent({
  mode,
  initialChildren,
  index,
  onSave,
  onDelete,
  onClose,
}: Omit<FootnoteDialogProps, 'open'>) {
  const [children, setChildren] = useState<InklingNonRecursiveBlockNode[]>(initialChildren)
  const saveButtonRef = useRef<HTMLButtonElement>(null)

  const handleSave = useCallback(() => {
    onSave(children)
  }, [children, onSave])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSave()
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [handleSave, onClose],
  )

  const isEmpty =
    children.length === 0 ||
    (children.length === 1 && children[0].type === 'paragraph' && children[0].children.length === 0)

  return (
    <div
      className="inkling-footnote-dialog fixed inset-0 z-50 flex items-center justify-center bg-scrim/30"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="flex w-full max-w-2xl flex-col rounded-xl border bg-popover p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium">{mode === 'create' ? '新建脚注' : `编辑脚注 ${index}`}</span>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>
        <div className="min-h-[8rem] rounded border bg-background">
          <NestedInklingEditor
            initialBlocks={initialChildren}
            onChange={setChildren}
            className="inkling-footnote-definition-editor p-3"
          />
        </div>
        <div className="mt-3 flex justify-between">
          <button
            type="button"
            onClick={onDelete}
            className="rounded border bg-background px-3 py-1 text-xs text-destructive hover:bg-destructive/10"
          >
            {mode === 'create' ? '取消' : '删除脚注'}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border bg-background px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              取消
            </button>
            <button
              ref={saveButtonRef}
              type="button"
              onClick={handleSave}
              disabled={isEmpty}
              className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
