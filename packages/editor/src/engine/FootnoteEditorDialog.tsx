import { Button } from '@kobato/editor/engine/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kobato/editor/engine/components/dialog'
import { Label } from '@kobato/editor/engine/components/label'
import { Textarea } from '@kobato/editor/engine/components/textarea'
import { useState } from 'react'

export interface FootnoteEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Create vs edit — affects title copy and delete visibility. */
  mode: 'create' | 'edit'
  /** Seed when `open` becomes true (edit loads existing plain text). */
  initialPlainText: string
  /** Persist body text; dialog closes after invoke. */
  onConfirm: (plainText: string) => void
  /** Remove this footnote definition and all inline refs (edit mode only). */
  onDelete?: () => void
}

export function FootnoteEditorDialog({
  open,
  onOpenChange,
  mode,
  initialPlainText,
  onConfirm,
  onDelete,
}: FootnoteEditorDialogProps) {
  const [draft, setDraft] = useState(initialPlainText)
  const [lastSeed, setLastSeed] = useState<{ open: boolean; text: string } | null>(null)
  if (lastSeed === null || lastSeed.open !== open || lastSeed.text !== initialPlainText) {
    setLastSeed({ open, text: initialPlainText })
    if (open) {
      setDraft(initialPlainText)
    }
  }

  const title = mode === 'create' ? '插入脚注' : '编辑脚注'
  const description =
    mode === 'create'
      ? '在下方填写脚注正文并保存；正文中的上标将指向此处内容。文末脚注列表由页面渲染时统一生成。'
      : '在下方修改脚注正文；保存写入条目，删除将移除该脚注及其正文中的上标引用。'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onConfirm(draft)
            onOpenChange(false)
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="footnote-editor-plain" className="text-xs">
              脚注正文
            </Label>
            <Textarea
              id="footnote-editor-plain"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              placeholder="在此输入脚注说明…（可多行）"
              className="text-sm"
            />
          </div>
          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            {mode === 'edit' && onDelete !== undefined ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  onDelete()
                  onOpenChange(false)
                }}
              >
                删除
              </Button>
            ) : null}
            <Button type="submit">保存</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
