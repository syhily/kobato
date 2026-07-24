import { CheckIcon, CopyIcon, ExternalLinkIcon, RefreshCwIcon, Trash2Icon, XIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { AdminImageDto } from '@/shared/contracts/images'

import { formatBytes } from '@/shared/utils/formatter'
import { Button } from '@/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/components/dialog'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import { cn } from '@/ui/lib/cn'

interface ImageDetailDialogProps {
  image: AdminImageDto | null
  open: boolean
  onClose: () => void
  copied: boolean
  isSavingNote: boolean
  isRecalculatingThumbhash: boolean
  onCopyUrl: (image: AdminImageDto) => void
  onSaveNote: (image: AdminImageDto, note: string | null) => void
  onDelete: (image: AdminImageDto) => void
  onRecalculateThumbhash: (image: AdminImageDto) => void
}

// Image library detail dialog. Owns the full preview and every meta
// field that used to live as a separate table column (path, public
// URL, dimensions, byte size, uploader, timestamps, note). The parent
// view remains a pure thumbnail grid; clicking a card opens this
// dialog.
//
// The note edit affordance lives inside the dialog (not in a separate
// flow) so the operator never has to bounce between dialog and grid:
// click → reveal → save / cancel → close. The delete affordance still
// hands off to the existing `ConfirmDialog` via `onDelete`.
export function ImageDetailDialog({
  image,
  open,
  onClose,
  copied,
  isSavingNote,
  isRecalculatingThumbhash,
  onCopyUrl,
  onSaveNote,
  onDelete,
  onRecalculateThumbhash,
}: ImageDetailDialogProps) {
  const [editingNote, setEditingNote] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [lastKey, setLastKey] = useState<{ open: boolean; imageId: string | null }>({
    open,
    imageId: image?.id ?? null,
  })
  const inputRef = useRef<HTMLInputElement>(null)

  const nextKey = { open, imageId: image?.id ?? null }
  if (nextKey.open !== lastKey.open || nextKey.imageId !== lastKey.imageId) {
    setLastKey(nextKey)
    if (!open || image === null) {
      setEditingNote(false)
      setNoteDraft('')
    } else {
      setEditingNote(false)
      setNoteDraft(image.note ?? '')
    }
  }

  useEffect(() => {
    if (editingNote) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editingNote])

  if (image === null) {
    return null
  }

  const currentNote = image.note ?? ''
  const commitNote = () => {
    const trimmed = noteDraft.trim()
    const next = trimmed === '' ? null : trimmed
    if ((next ?? '') !== currentNote) {
      onSaveNote(image, next)
    }
    setEditingNote(false)
  }
  const cancelEdit = () => {
    setNoteDraft(currentNote)
    setEditingNote(false)
  }

  const fileName = image.storagePath.split('/').pop() ?? image.storagePath

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="h-dvh max-h-dvh w-dvw max-w-dvw gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-auto sm:max-h-[min(900px,92dvh)] sm:max-w-3xl sm:rounded-xl sm:border">
        <div className="flex h-dvh flex-col sm:h-auto sm:max-h-[min(900px,92dvh)]">
          <DialogHeader className="shrink-0 px-4 pt-4 sm:px-6 sm:pt-6">
            <DialogTitle className="truncate text-base sm:text-lg">{fileName}</DialogTitle>
            <DialogDescription className="truncate text-xs sm:text-sm">{image.storagePath}</DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-2 sm:gap-4 sm:px-6">
            <div className="flex items-center justify-center rounded-xl border bg-muted">
              {/* Plain <img>: this is the admin library, lazy-loaded
                  remote URL, alt="" because the file path + meta
                  fields below already convey the image identity. */}
              <img
                src={image.publicUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="max-h-[35vh] w-auto max-w-full rounded-xl object-contain sm:max-h-[50vh] lg:max-h-[60vh]"
              />
            </div>

            <dl className="grid grid-cols-2 gap-2 sm:gap-3">
              <MetaField label="尺寸">
                {image.width}×{image.height}
              </MetaField>
              <MetaField label="大小">{formatBytes(image.byteSize)}</MetaField>
              <MetaField label="MIME">{image.mimeType}</MetaField>
              <MetaField label="上传人">{image.uploaderName ?? '—'}</MetaField>
              <MetaField label="创建时间">{formatDateTime(image.createdAt)}</MetaField>
              <MetaField label="更新时间">{formatDateTime(image.updatedAt)}</MetaField>
            </dl>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">公开 URL</Label>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded border bg-muted px-2 py-1 font-mono text-xs">
                  {image.publicUrl}
                </code>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onCopyUrl(image)}
                    aria-label="复制公开 URL"
                  >
                    {copied ? <CheckIcon data-icon /> : <CopyIcon data-icon />}
                    <span className="hidden sm:inline">{copied ? '已复制' : '复制'}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    render={
                      <a href={image.publicUrl} target="_blank" rel="nofollow noreferrer" aria-label="在新标签页打开">
                        <ExternalLinkIcon data-icon />
                        <span className="hidden sm:inline">打开</span>
                      </a>
                    }
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">备注</Label>
              {editingNote ? (
                <Input
                  ref={inputRef}
                  value={noteDraft}
                  maxLength={200}
                  disabled={isSavingNote}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onBlur={commitNote}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      commitNote()
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      cancelEdit()
                    }
                  }}
                  placeholder="便于后台搜索（如「2024 年终总结题图」）"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setNoteDraft(currentNote)
                    setEditingNote(true)
                  }}
                  className="cursor-text rounded border border-transparent px-2 py-1 text-left text-sm transition-colors outline-none hover:border-input hover:bg-muted/50 focus-visible:border-input focus-visible:bg-muted/50"
                  title="点击编辑"
                >
                  {image.note || <span className="text-muted-foreground">— 点击添加备注 —</span>}
                </button>
              )}
            </div>
          </div>

          <DialogFooter className="shrink-0 flex-col-reverse gap-2 border-t px-4 py-3 sm:flex-row sm:justify-between sm:px-6 sm:py-4">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => onDelete(image)}
            >
              <Trash2Icon data-icon /> 删除
            </Button>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => onRecalculateThumbhash(image)}
                disabled={isRecalculatingThumbhash}
              >
                <RefreshCwIcon data-icon className={cn(isRecalculatingThumbhash && 'animate-spin')} />{' '}
                {isRecalculatingThumbhash ? '计算中…' : '重新计算 thumbhash'}
              </Button>
              <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={onClose}>
                <XIcon data-icon /> 关闭
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function MetaField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

function formatDateTime(iso: string): string {
  try {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) {
      return iso
    }
    return date.toLocaleString()
  } catch {
    return iso
  }
}
