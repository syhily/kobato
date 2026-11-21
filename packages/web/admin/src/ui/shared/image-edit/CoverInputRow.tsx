import type { AdminImageDto, UploadKind } from '@kobato/contracts/images'

import { Button } from '@kobato/ui/components/button'
import { Label } from '@kobato/ui/components/label'
import { cn } from '@kobato/ui/lib/cn'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { UploadImageDialog } from '@kobato/web-admin/ui/shared/image-edit/UploadImageDialog'
import { useErroredSrc } from '@kobato/web-admin/ui/shared/image-edit/use-errored-src'
import { ImageOffIcon, XIcon } from 'lucide-react'
import { useState } from 'react'

export interface CoverInputRowProps {
  label: string
  htmlFor: string
  description?: string
  value: string
  onChange: (value: string) => void
  /** `kind` for the upload dialog — the parent must keep `slug` / `host` in
   *  sync or the upload lands at a stale object key; `null` disables upload. */
  uploadKind: UploadKind | null
  fallbackSrc?: string
  thumbnailClassName?: string
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
  const { t } = useI18n()
  const [uploadOpen, setUploadOpen] = useState(false)

  const hasValue = value !== ''
  const previewSrc = hasValue ? value : (fallbackSrc ?? null)
  const [previewBroken, markPreviewErrored] = useErroredSrc(previewSrc)

  const onUploaded = (image: AdminImageDto) => {
    onChange(image.publicUrl)
    setUploadOpen(false)
  }

  const uploadDisabled = uploadKind === null
  const uploadTitle = uploadKind === null ? t('admin.shared.cover.uploadDisabled') : undefined

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-9 items-center justify-between gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {hasValue ? (
          <Button
            variant="ghost"
            size="icon"
            type="button"
            title={t('admin.shared.cover.clear')}
            aria-label={t('admin.shared.cover.clearLabel', { label })}
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
          title={uploadTitle ?? (value === '' ? t('admin.shared.cover.upload') : t('admin.shared.cover.replace'))}
        >
          {previewSrc !== null && !previewBroken ? (
            <img
              src={previewSrc}
              alt={hasValue ? label : t('admin.shared.cover.preview', { label })}
              loading="lazy"
              decoding="async"
              className={cn('h-full w-full', objectFit === 'contain' ? 'object-contain' : 'object-cover')}
              onError={markPreviewErrored}
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
