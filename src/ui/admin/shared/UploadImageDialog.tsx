import { RotateCwIcon, SaveIcon, UploadIcon, XIcon } from 'lucide-react'
import { type SubmitEventHandler, useCallback, useEffect, useRef, useState } from 'react'

import type { AdminImageDto } from '@/shared/types/images'

import { orpc } from '@/client/api/client'
import { ImageEditorCanvas, type LockedAspect } from '@/ui/admin/shared/ImageEditorCanvas'
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

// Upload variants. The fixed-aspect variants pre-set the locked
// 1280×425 ratio used by category covers and friend posters; the
// generic variant lets the operator pick a free crop.
//
// `kind` carries the discriminator field the backend expects in the
// metadata block, plus the supplementary key (slug or host) that
// determines the target S3 object key.
export type UploadKind = { kind: 'generic' } | { kind: 'category'; slug: string } | { kind: 'friend'; host: string }

export interface UploadImageDialogProps {
  open: boolean
  /**
   * Discriminator that decides three things at once:
   *   - the locked aspect ratio for the cropper (or "free")
   *   - the metadata key sent in the multipart body
   *   - the dialog title shown to the operator
   *
   * Closing the dialog should reset this on the parent so the editor
   * canvas unloads its bitmap.
   */
  kind: UploadKind
  onClose: () => void
  onUploaded: (image: AdminImageDto) => void
  /**
   * When provided, the dialog seeds its editor with this file on open
   * instead of waiting for the user to pick one through the file input.
   * Used by drag-and-drop flows.
   */
  initialFile?: File
}

const LOCKED_ASPECT: LockedAspect = { width: 1280, height: 425 }

export function UploadImageDialog({ open, kind, onClose, onUploaded, initialFile }: UploadImageDialogProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0)
  const [jpegQuality, setJpegQuality] = useState<number>(82)
  const [note, setNote] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // `cropWidth` is the current source-pixel width of the crop
  // rectangle reported by `<ImageEditorCanvas onCropChange>`. It's
  // the upper bound for the operator-visible "目标宽度" input below
  // (resizing larger than the crop would upscale and add nothing).
  // `targetWidth` is null for "no resize" — the encoder writes the
  // crop at its native resolution.
  const [cropWidth, setCropWidth] = useState<number | null>(null)
  const [targetWidth, setTargetWidth] = useState<number | null>(null)
  // Operator-visible value for the width input. Kept separate from
  // the committed `targetWidth` so an in-progress edit (e.g. "12"
  // on the way to "1280") doesn't immediately clamp / re-encode.
  const [targetWidthDraft, setTargetWidthDraft] = useState<string>('')
  const encoderRef = useRef<(() => Promise<{ blob: Blob; width: number; height: number }>) | null>(null)
  const [isPending, setIsPending] = useState(false)

  // Reset internal state every time the dialog opens. Without this, the
  // previous selection's preview would flash for a moment when the
  // operator reopens the dialog with a fresh `kind`. Keyed on `open`
  // alone — `kind` changes between renders are not interesting (the
  // discriminator only flips when the parent rebuilds the dialog), and
  // including a fresh-each-render `kind` object would re-fire the
  // reset on every parent render.
  useEffect(() => {
    if (!open) {
      return
    }
    setFile(initialFile ?? null)
    setRotation(0)
    setJpegQuality(82)
    setNote('')
    setErrorMessage(null)
    setCropWidth(null)
    setTargetWidth(null)
    setTargetWidthDraft('')
    encoderRef.current = null
    setIsPending(false)
  }, [open, initialFile])

  const onSelectFile = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null
    if (next === null) {
      return
    }
    setFile(next)
    setRotation(0)
    setErrorMessage(null)
  }, [])

  const handleEncoderReady = useCallback((encoder: () => Promise<{ blob: Blob; width: number; height: number }>) => {
    encoderRef.current = encoder
  }, [])

  // Snap the committed `targetWidth` down whenever the operator
  // resizes the crop rectangle below it. The draft string is left
  // alone so a partial edit ("12" on the way to "1280") survives a
  // crop nudge — the input commits on blur / Enter through the
  // helper below.
  const handleCropChange = useCallback((nextCropWidth: number, _nextCropHeight: number) => {
    const rounded = Math.max(1, Math.round(nextCropWidth))
    setCropWidth(rounded)
    setTargetWidth((prev) => (prev !== null && prev > rounded ? rounded : prev))
  }, [])

  const commitTargetWidth = useCallback(
    (raw: string) => {
      const trimmed = raw.trim()
      if (trimmed === '') {
        setTargetWidth(null)
        setTargetWidthDraft('')
        return
      }
      const parsed = Number.parseInt(trimmed, 10)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setTargetWidth(null)
        setTargetWidthDraft('')
        return
      }
      const cap = cropWidth ?? parsed
      const clamped = Math.min(parsed, cap)
      setTargetWidth(clamped)
      setTargetWidthDraft(String(clamped))
    },
    [cropWidth],
  )

  const performUpload = useCallback(async () => {
    if (file === null) {
      setErrorMessage('请先选择图片')
      return
    }
    if (encoderRef.current === null) {
      setErrorMessage('图片尚未准备好，请稍候再试')
      return
    }
    setErrorMessage(null)
    setIsPending(true)
    try {
      const encoded = await encoderRef.current()
      // oRPC's RPC link serializes Blob inputs as `multipart/form-data`
      // automatically; metadata travels alongside in the same envelope.
      const trimmedNote = note.trim()
      const metadata =
        kind.kind === 'category'
          ? {
              kind: 'category' as const,
              slug: kind.slug,
              ...(trimmedNote !== '' ? { note: trimmedNote } : {}),
            }
          : kind.kind === 'friend'
            ? {
                kind: 'friend' as const,
                host: kind.host,
                ...(trimmedNote !== '' ? { note: trimmedNote } : {}),
              }
            : { kind: 'generic' as const, ...(trimmedNote !== '' ? { note: trimmedNote } : {}) }
      const data = await orpc.admin.images.upload({ file: encoded.blob, metadata })
      onUploaded(data.image)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '上传失败')
    } finally {
      setIsPending(false)
    }
  }, [file, kind, note, onUploaded])

  const onSubmit: SubmitEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault()
    void performUpload()
  }

  const lockedAspect = kind.kind === 'generic' ? undefined : LOCKED_ASPECT

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !isPending && onClose()}>
      {/* `max-h-[calc(100dvh-2rem)]` clamps the dialog to the viewport
          even when the source image's aspect ratio (or natural size)
          would otherwise push the cropper canvas past the bottom of
          the screen — without it a portrait phone shot on a small
          laptop would render the dialog footer outside the visible
          area and the operator could never click "上传". `dvh` (not
          `vh`) tracks the actual visible viewport on iOS Safari so
          the footer doesn't disappear under the URL bar. The form
          below carries `min-h-0 overflow-y-auto` so the cropper +
          quality + note section scrolls internally instead, while
          the header/footer stay pinned. The wide cap is gated on
          `sm:` so mobile keeps the base `max-w-[calc(100%-2rem)]`
          breathing room — without it the dialog goes edge-to-edge
          and the backdrop has no tappable area to dismiss. */}
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-3xl">
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{titleFor(kind)}</DialogTitle>
            <DialogDescription>
              选择本地图片，调整裁剪、旋转、画质，点击「上传」后将转换为 JPEG 并保存到 S3。
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
            {file === null ? (
              <div className="flex flex-col items-center gap-3 rounded-md border border-dashed p-8">
                <UploadIcon className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">点击下方按钮选择本地图片</p>
                <Button type="button" onClick={() => fileInputRef.current?.click()}>
                  <UploadIcon data-icon /> 选择图片
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  aria-label="选择图片文件"
                  onChange={onSelectFile}
                />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{file.name}</span>
                    <span className="text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setRotation((prev) => ((prev + 90) % 360) as 0 | 90 | 180 | 270)}
                    >
                      <RotateCwIcon data-icon /> 旋转 90°
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                      <UploadIcon data-icon /> 重新选择
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      aria-label="选择图片文件"
                      onChange={onSelectFile}
                    />
                  </div>
                </div>
                <ImageEditorCanvas
                  file={file}
                  rotation={rotation}
                  jpegQuality={jpegQuality}
                  locked={lockedAspect}
                  outputWidth={kind.kind === 'generic' && targetWidth !== null ? targetWidth : undefined}
                  onCropChange={handleCropChange}
                  onReady={handleEncoderReady}
                />
                {kind.kind === 'generic' && cropWidth !== null ? (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="upload-target-width">输出宽度（像素，最大 {cropWidth}）</Label>
                    <Input
                      id="upload-target-width"
                      type="number"
                      min={1}
                      max={cropWidth}
                      step={1}
                      inputMode="numeric"
                      value={targetWidthDraft}
                      onChange={(event) => setTargetWidthDraft(event.target.value)}
                      onBlur={(event) => commitTargetWidth(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          commitTargetWidth((event.target as HTMLInputElement).value)
                        }
                      }}
                      placeholder={`留空则使用裁剪宽度 ${cropWidth}`}
                    />
                    <p className="text-xs text-muted-foreground">
                      留空则按裁剪后的原始宽度导出；填入数值会按比例缩放，不能超过裁剪宽度。
                    </p>
                  </div>
                ) : null}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="upload-quality">JPEG 质量 ({jpegQuality})</Label>
                  <input
                    id="upload-quality"
                    type="range"
                    min={50}
                    max={95}
                    step={1}
                    value={jpegQuality}
                    onChange={(event) => setJpegQuality(Number(event.target.value))}
                    className="w-full"
                    aria-label="JPEG 质量"
                  />
                  <p className="text-xs text-muted-foreground">
                    越高越清晰、文件越大。常规图建议 80-85，封面/海报建议 82-90。
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="upload-note">备注（可选）</Label>
                  <Input
                    id="upload-note"
                    type="text"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={200}
                    placeholder="便于后台搜索（如「2024 年终总结题图」）"
                  />
                </div>
              </>
            )}
            {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              <XIcon data-icon /> 取消
            </Button>
            <Button type="submit" disabled={isPending || file === null}>
              <SaveIcon data-icon /> {isPending ? '上传中…' : '上传'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function titleFor(kind: UploadKind): string {
  switch (kind.kind) {
    case 'category':
      return `上传分类封面 · ${kind.slug}`
    case 'friend':
      return `上传友链海报 · ${kind.host}`
    case 'generic':
      return '上传图片'
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }
  return `${bytes} B`
}
