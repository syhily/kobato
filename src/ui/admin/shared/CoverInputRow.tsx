import { ImageOffIcon, XIcon } from 'lucide-react'
import { useState } from 'react'

import type { AdminImageDto } from '@/shared/contracts/images'

import { UploadImageDialog, type UploadKind } from '@/ui/admin/shared/UploadImageDialog'
import { Button } from '@/ui/components/button'
import { Label } from '@/ui/components/label'
import { cn } from '@/ui/lib/cn'

// Shared cover/poster row; every image goes through the upload pipeline —
// no manual URL pasting (keeps CSP `img-src` predictable).
export interface CoverInputRowProps {
  label: string
  htmlFor: string
  description?: string
  /** Current URL value held by the parent form. */
  value: string
  /** Updates the parent's draft when an upload completes or the value is cleared. */
  onChange: (value: string) => void
  /** `kind` for the upload dialog — the parent must keep `slug` / `host` in
   *  sync or the upload lands at a stale object key; `null` disables upload. */
  uploadKind: UploadKind | null
  /** Preview inside the thumbnail when `value` is empty (e.g. the auto-generated OG card). */
  fallbackSrc?: string
  /** Optional Tailwind classes for the thumbnail button; defaults to `h-24 w-full`. */
  thumbnailClassName?: string
  /** Object-fit for the preview image; default `cover`, `contain` for fixed-aspect banners (1280×425). */
  objectFit?: 'cover' | 'contain'
}

export function CoverInputRow({
  label,
  htmlFor,
  description,
  value,
  onChange,
  uploadKind,
  fallbackSrc,
  thumbnailClassName,
  objectFit = 'cover',
}: CoverInputRowProps) {
  const [uploadOpen, setUploadOpen] = useState(false)

  const hasValue = value !== ''

  const onUploaded = (image: AdminImageDto) => {
    onChange(image.publicUrl)
    setUploadOpen(false)
  }

  // No "uploads disabled" gate — the only precondition is a supplied `kind` (the slug/host it needs).
  const uploadDisabled = uploadKind === null
  const uploadTitle = uploadKind === null ? '请先填写 slug / host 后再上传' : undefined

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-9 items-center justify-between gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {hasValue ? (
          <Button
            variant="ghost"
            size="icon"
            type="button"
            title="清空"
            aria-label={`清空 ${label}`}
            onClick={() => onChange('')}
          >
            <XIcon />
          </Button>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={uploadDisabled}
          onClick={() => setUploadOpen(true)}
          className={cn(
            'flex items-center justify-center overflow-hidden rounded border bg-muted',
            thumbnailClassName ?? 'h-24 w-full',
            uploadDisabled
              ? 'cursor-not-allowed opacity-60'
              : 'cursor-pointer hover:border-primary hover:ring-2 hover:ring-primary/30',
          )}
          title={uploadTitle ?? (value === '' ? '点击上传' : '点击替换')}
        >
          {hasValue ? (
            <img
              src={value}
              alt={label}
              loading="lazy"
              decoding="async"
              className={cn('h-full w-full', objectFit === 'contain' ? 'object-contain' : 'object-cover')}
              onError={(e) => {
                ;(e.currentTarget as HTMLImageElement).style.visibility = 'hidden'
              }}
            />
          ) : fallbackSrc ? (
            <img
              src={fallbackSrc}
              alt={`${label} 预览`}
              loading="lazy"
              decoding="async"
              className={cn('h-full w-full', objectFit === 'contain' ? 'object-contain' : 'object-cover')}
              onError={(e) => {
                ;(e.currentTarget as HTMLImageElement).style.visibility = 'hidden'
              }}
            />
          ) : (
            <ImageOffIcon className="size-4 text-muted-foreground" />
          )}
        </button>
      </div>

      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}

      {uploadKind !== null && (
        <UploadImageDialog
          open={uploadOpen}
          kind={uploadKind}
          onClose={() => setUploadOpen(false)}
          onUploaded={onUploaded}
        />
      )}
    </div>
  )
}
