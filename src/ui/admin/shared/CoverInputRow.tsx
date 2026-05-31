import { ImageOffIcon, LinkIcon, XIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { AdminImageDto } from '@/shared/types/images'

import { useAssetsSettingsOptional } from '@/shared/lib/blog-config-context'
import { UploadImageDialog, type UploadKind } from '@/ui/admin/shared/UploadImageDialog'
import { Button } from '@/ui/components/button'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import { cn } from '@/ui/lib/cn'

// Shared cover/poster row used by `EditCategoryDialog` and
// `EditFriendDialog`. Replaces the previous "single URL input" layout
// with a preview + upload button + collapsible URL input.
//
// Layout:
//   [full-width thumbnail]                 <— click to upload / replace
//   [URL input field]                       <— hidden by default;
//                                              toggle via link icon
//
// The dialog is invoked through the `kind` discriminator: passing
// `{ kind: 'category', slug }` locks the cropper to 1280×425 and
// targets `images/categories/<slug>.jpg`; `{ kind: 'friend', host }`
// likewise targets `images/links/<host>.jpg`. Generic uploads are
// supported but unused by this row (it's exclusively for fixed-aspect
// covers — the image library page uses `UploadImageDialog` directly
// for free-form uploads).
export interface CoverInputRowProps {
  label: string
  htmlFor: string
  description?: string
  /** Current URL value held by the parent form. */
  value: string
  /** Updates the parent's draft when the URL changes (manual edit or upload completes). */
  onChange: (value: string) => void
  /**
   * `kind` for the upload dialog. The parent must keep `slug` / `host`
   * in sync with the matching form field — otherwise the upload will
   * land at a stale object key. Passing `null` disables the upload
   * button (e.g. when the slug field is empty in "new entry" mode).
   */
  uploadKind: UploadKind | null
  /**
   * The auto-generated public URL for the configured `uploadKind`. When
   * `value` matches this URL exactly the manual URL input collapses to
   * a "auto-managed" hint to keep the form clean for the common path.
   * Pass an empty string to always show the manual input.
   */
  expectedAutoUrl: string
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
  expectedAutoUrl,
  fallbackSrc,
  thumbnailClassName,
}: CoverInputRowProps) {
  const [uploadOpen, setUploadOpen] = useState(false)
  const [showManualInput, setShowManualInput] = useState(false)
  const assetsSettings = useAssetsSettingsOptional()
  // Mirror the perimeter's gate: when the master upload toggle is
  // OFF, refuse to even open the upload dialog so the operator gets
  // a single tooltip instead of a 503 toast after picking a file.
  // The manual URL input remains usable so admins can still paste
  // historical S3 URLs while uploads are paused.
  const uploadsEnabled = assetsSettings?.storage.enabled === true

  const isAutoManaged = useMemo(() => {
    if (expectedAutoUrl === '' || value === '') {
      return false
    }
    return value === expectedAutoUrl
  }, [value, expectedAutoUrl])

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

  const hasValue = value !== ''

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            type="button"
            title={showManualInput ? '收起 URL 输入' : '粘贴 URL'}
            aria-label={showManualInput ? `收起 ${label} 的 URL 输入` : `粘贴 ${label} 的 URL`}
            aria-pressed={showManualInput}
            onClick={() => setShowManualInput((prev) => !prev)}
          >
            <LinkIcon />
          </Button>
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
      </div>
      <div className="flex items-center gap-3">
        {/* Thumbnail preview — now a click target that opens the upload
            dialog so the operator can replace by clicking the image itself. */}
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

      {showManualInput && (
        <Input
          id={htmlFor}
          type="url"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
          placeholder={expectedAutoUrl !== '' ? expectedAutoUrl : 'https://example.com/cover.jpg'}
        />
      )}
      {!isAutoManaged && !showManualInput && value !== '' && (
        <p className="text-xs text-muted-foreground">
          已设置自定义图片 <code className="font-mono">{value}</code>。
        </p>
      )}
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
