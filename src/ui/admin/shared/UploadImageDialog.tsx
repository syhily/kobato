import { RotateCwIcon, SaveIcon, UploadIcon, XIcon } from 'lucide-react'
import { Suspense, type SubmitEventHandler, lazy, useCallback, useEffect, useRef, useState } from 'react'

import type { AdminImageDto } from '@/shared/contracts/images'
import type { LockedAspect } from '@/ui/admin/shared/ImageEditorCanvas'

import { orpc } from '@/client/api/client'
import { formatBytes } from '@/shared/i18n/format'
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
import { type I18nValue, useI18n } from '@/ui/lib/I18nProvider'

const ImageEditorCanvas = lazy(() =>
  import('@/ui/admin/shared/ImageEditorCanvas').then((m) => ({ default: m.ImageEditorCanvas })),
)

export type UploadKind = { kind: 'generic' } | { kind: 'category'; slug: string } | { kind: 'friend'; host: string }

export interface UploadImageDialogProps {
  open: boolean
  kind: UploadKind
  onClose: () => void
  onUploaded: (image: AdminImageDto) => void
  initialFile?: File
}

const LOCKED_ASPECT: LockedAspect = { width: 1280, height: 425 }

export function UploadImageDialog({ open, kind, onClose, onUploaded, initialFile }: UploadImageDialogProps) {
  const { locale, t } = useI18n()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0)
  const [jpegQuality, setJpegQuality] = useState<number>(82)
  const [note, setNote] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [cropWidth, setCropWidth] = useState<number | null>(null)
  const [targetWidth, setTargetWidth] = useState<number | null>(null)
  const [targetWidthDraft, setTargetWidthDraft] = useState<string>('')
  const encoderRef = useRef<(() => Promise<{ blob: Blob; width: number; height: number }>) | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [lastOpen, setLastOpen] = useState<{ open: boolean; initialFile: File | undefined } | null>(null)
  if (lastOpen === null || lastOpen.open !== open || lastOpen.initialFile !== initialFile) {
    setLastOpen({ open, initialFile })
    if (open) {
      setFile(initialFile ?? null)
      setRotation(0)
      setJpegQuality(82)
      setNote('')
      setErrorMessage(null)
      setCropWidth(null)
      setTargetWidth(null)
      setTargetWidthDraft('')
      setIsPending(false)
    }
  }
  useEffect(() => {
    if (!open) {
      encoderRef.current = null
    }
  }, [open])

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
      setErrorMessage(t('admin.shared.upload.selectFirst'))
      return
    }
    if (encoderRef.current === null) {
      setErrorMessage(t('admin.shared.upload.notReady'))
      return
    }
    setErrorMessage(null)
    setIsPending(true)
    try {
      const encoded = await encoderRef.current()
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
      setErrorMessage(err instanceof Error ? err.message : t('admin.toast.uploadFailed'))
    }
    // React Compiler can't lower try/finally — the pending reset runs after the catch instead.
    setIsPending(false)
  }, [file, kind, note, onUploaded, t])

  const onSubmit: SubmitEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault()
    void performUpload()
  }

  const lockedAspect = kind.kind === 'generic' ? undefined : LOCKED_ASPECT

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !isPending && onClose()}>
      {/* `max-h-[calc(100dvh-2rem)]` clamps the dialog to the viewport so a
          tall cropper never pushes the footer (and its "上传" button) off
          screen; `dvh` tracks iOS Safari's visible viewport. The form below
          carries `min-h-0 overflow-y-auto` so the body scrolls while the
          header/footer stay pinned. The wide cap is `sm:`-gated so mobile
          keeps edge breathing room for backdrop-dismiss. */}
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-3xl">
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{titleFor(kind, t)}</DialogTitle>
            <DialogDescription>{t('admin.shared.upload.description')}</DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
            {file === null ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8">
                <UploadIcon className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t('admin.shared.upload.selectHint')}</p>
                <Button type="button" onClick={() => fileInputRef.current?.click()}>
                  <UploadIcon data-icon /> {t('admin.shared.upload.selectImage')}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  aria-label={t('admin.shared.upload.selectFileAria')}
                  onChange={onSelectFile}
                />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{file.name}</span>
                    <span className="text-xs text-muted-foreground">{formatBytes(file.size, { locale })}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setRotation((prev) => {
                          const next = (prev + 90) % 360
                          if (next === 0 || next === 90 || next === 180 || next === 270) {
                            return next
                          }
                          return prev
                        })
                      }
                    >
                      <RotateCwIcon data-icon /> {t('admin.shared.upload.rotate')}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                      <UploadIcon data-icon /> {t('admin.shared.upload.reselect')}
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      aria-label={t('admin.shared.upload.selectFileAria')}
                      onChange={onSelectFile}
                    />
                  </div>
                </div>
                <Suspense
                  fallback={<p className="text-sm text-muted-foreground">{t('admin.shared.upload.editorLoading')}</p>}
                >
                  <ImageEditorCanvas
                    file={file}
                    rotation={rotation}
                    jpegQuality={jpegQuality}
                    locked={lockedAspect}
                    outputWidth={kind.kind === 'generic' && targetWidth !== null ? targetWidth : undefined}
                    onCropChange={handleCropChange}
                    onReady={handleEncoderReady}
                  />
                </Suspense>
                {kind.kind === 'generic' && cropWidth !== null ? (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="upload-target-width">
                      {t('admin.shared.upload.outputWidth', { max: cropWidth })}
                    </Label>
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
                          if (event.target instanceof HTMLInputElement) {
                            commitTargetWidth(event.target.value)
                          }
                        }
                      }}
                      placeholder={t('admin.shared.upload.outputWidthPlaceholder', { width: cropWidth })}
                    />
                    <p className="text-xs text-muted-foreground">{t('admin.shared.upload.outputWidthHint')}</p>
                  </div>
                ) : null}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="upload-quality">{t('admin.shared.upload.quality', { quality: jpegQuality })}</Label>
                  <input
                    id="upload-quality"
                    type="range"
                    min={50}
                    max={95}
                    step={1}
                    value={jpegQuality}
                    onChange={(event) => setJpegQuality(Number(event.target.value))}
                    className="w-full"
                    aria-label={t('admin.shared.upload.qualityAria')}
                  />
                  <p className="text-xs text-muted-foreground">{t('admin.shared.upload.qualityHint')}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="upload-note">{t('admin.shared.upload.note')}</Label>
                  <Input
                    id="upload-note"
                    type="text"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={200}
                    placeholder={t('admin.shared.upload.notePlaceholder')}
                  />
                </div>
              </>
            )}
            {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              <XIcon data-icon /> {t('common.action.cancel')}
            </Button>
            <Button type="submit" disabled={isPending || file === null}>
              <SaveIcon data-icon /> {isPending ? t('admin.shared.upload.uploading') : t('admin.shared.upload.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function titleFor(kind: UploadKind, t: I18nValue['t']): string {
  switch (kind.kind) {
    case 'category':
      return t('admin.shared.upload.categoryTitle', { slug: kind.slug })
    case 'friend':
      return t('admin.shared.upload.friendTitle', { host: kind.host })
    case 'generic':
      return t('admin.shared.upload.genericTitle')
  }
}
