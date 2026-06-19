import { useCallback, useEffect, useRef, useState } from 'react'

interface FootnoteDialogProps {
  open: boolean
  initialText: string
  index: number
  onSave: (text: string) => void
  onDelete: () => void
  onClose: () => void
}

export function FootnoteDialog({ open, initialText, index, onSave, onDelete, onClose }: FootnoteDialogProps) {
  if (!open) {
    return null
  }
  return (
    <FootnoteDialogContent
      key={`${initialText}-${index}`}
      initialText={initialText}
      index={index}
      onSave={onSave}
      onDelete={onDelete}
      onClose={onClose}
    />
  )
}

function FootnoteDialogContent({
  initialText,
  index,
  onSave,
  onDelete,
  onClose,
}: Omit<FootnoteDialogProps, 'open'>) {
  const [text, setText] = useState(initialText)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 50)
  }, [])

  const handleSave = useCallback(() => {
    if (text.trim().length === 0) { return }
    onSave(text.trim())
    onClose()
  }, [text, onSave, onClose])

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

  return (
    <div
      className="inkling-footnote-dialog fixed inset-0 z-50 flex items-center justify-center bg-scrim/30"
      onClick={onClose}
    >
      <div className="w-full max-w-lg rounded-xl border bg-popover p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium">脚注 {index}</span>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={4}
          placeholder="输入脚注内容…"
          className="w-full rounded border bg-background px-3 py-2 text-sm"
        />
        <div className="mt-3 flex justify-between">
          <button
            type="button"
            onClick={onDelete}
            className="rounded border bg-background px-3 py-1 text-xs text-destructive hover:bg-destructive/10"
          >
            删除脚注
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
              type="button"
              onClick={handleSave}
              disabled={text.trim().length === 0}
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
