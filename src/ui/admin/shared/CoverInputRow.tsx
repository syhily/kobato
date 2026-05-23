import { ImageOffIcon, UploadIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { AdminImageDto } from '@/shared/types/images'

import { useAssetsSettingsOptional } from '@/shared/lib/blog-config-context'
import { UploadImageDialog, type UploadKind } from '@/ui/admin/shared/UploadImageDialog'
import { Button } from '@/ui/components/button'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'

// Shared cover/poster row used by `EditCategoryDialog` and
// `EditFriendDialog`. Replaces the previous "single URL input" layout
// with a preview + upload button + collapsible URL input.
//
// Layout:
//   [80×40 thumbnail] [上传 / 替换 button]   <— always visible
//   [URL input field]                       <— hidden when value
//                                              matches the auto-
//                                              generated S3 key for
//                                              the active `kind`
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
}

export function CoverInputRow({
  label,
  htmlFor,
  description,
  value,
  onChange,
  uploadKind,
  expectedAutoUrl,
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

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      <div className="flex items-center gap-3">
        {/* Thumbnail preview. Shows a placeholder icon when no URL is
            set so the slot height stays predictable across new/edit
            modes. */}
        <div className="flex h-10 w-20 items-center justify-center overflow-hidden rounded border bg-muted">
          {value !== '' ? (
            <>
              {/* Small preview thumbnail (80×40): the URL is already a public S3
                  object; no CDN transform needed for this size. */}
              <img src={value} alt={label} loading="lazy" decoding="async" className="h-full w-full object-cover" />
            </>
          ) : (
            <ImageOffIcon className="size-4 text-muted-foreground" />
          )}
        </div>
        <Button type="button" onClick={() => setUploadOpen(true)} disabled={uploadDisabled} title={uploadTitle}>
          <UploadIcon data-icon /> {value === '' ? '上传' : '替换'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setShowManualInput((prev) => !prev)}>
          {showManualInput ? '收起 URL 输入' : '手动填写 URL'}
        </Button>
      </div>

      {(!isAutoManaged || showManualInput) && (
        <Input
          id={htmlFor}
          type="url"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
          placeholder={expectedAutoUrl !== '' ? expectedAutoUrl : 'https://example.com/cover.jpg'}
        />
      )}
      {isAutoManaged && !showManualInput && (
        <p className="text-xs text-muted-foreground">
          已使用自动生成的对象键 <code className="font-mono">{value}</code>。
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
