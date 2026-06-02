import { ImageOffIcon, XIcon } from 'lucide-react'
import { useState } from 'react'

import type { AdminImageDto } from '@/shared/types/images'

import { useAssetsSettingsOptional } from '@/shared/lib/blog-config-context'
import { UploadImageDialog, type UploadKind } from '@/ui/admin/shared/UploadImageDialog'
import { Button } from '@/ui/components/button'
import { Label } from '@/ui/components/label'
import { cn } from '@/ui/lib/cn'

// Shared cover/poster row used by `EditCategoryDialog`, `EditTagDialog`
// and `EditFriendDialog`. Provides a click-to-upload thumbnail preview
// plus a clear button. Manual URL pasting is intentionally removed so
// every image goes through the upload pipeline and stays under the
// same asset host (keeps CSP `img-src` predictable).
export interface CoverInputRowProps {
  label: string
  htmlFor: string
  description?: string
  /** Current URL value held by the parent form. */
  value: string
  /** Updates the parent's draft when an upload completes or the value is cleared. */
  onChange: (value: string) => void
  /**
   * `kind` for the upload dialog. The parent must keep `slug` / `host`
   * in sync with the matching form field — otherwise the upload will
   * land at a stale object key. Passing `null` disables the upload
   * button (e.g. when the slug field is empty in "new entry" mode).
   */
  uploadKind: UploadKind | null
  /**
   * Optional preview image shown inside the thumbnail when `value` is
   * empty. Used by OG fields to display the auto-generated default card
   * so the operator sees what will be rendered before clicking to
   * override.
   */
  fallbackSrc?: string
  /**
   * Optional Tailwind classes applied to the thumbnail button.
   * Defaults to `h-24 w-full` when omitted.
   */
  thumbnailClassName?: string
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
}: CoverInputRowProps) {
  const [uploadOpen, setUploadOpen] = useState(false)
  const assetsSettings = useAssetsSettingsOptional()
  const uploadsEnabled = assetsSettings?.storage.enabled === true

  const hasValue = value !== ''

  const onUploaded = (image: AdminImageDto) => {
    onChange(image.publicUrl)
    setUploadOpen(false)
  }

  const uploadDisabled = uploadKind === null || !uploadsEnabled
  const uploadTitle = (() => {
    if (uploadKind === null) {
      return '请先填写 slug / host 后再上传'
    }
    if (!uploadsEnabled) {
      return 'S3 上传未开启；请到 /admin/settings/assets 启用'
    }
    return undefined
  })()

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
              className="h-full w-full object-cover"
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
              className="h-full w-full object-cover"
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
