import type { AdminImageDto } from '@kobato/shared/contracts/images'

import { ImageLibraryPicker } from '@kobato/ui/admin/editor-pickers/ImageLibraryPicker'
import { UploadImageDialog } from '@kobato/ui/admin/shared/UploadImageDialog'
import { Badge } from '@kobato/ui/components/badge'
import { Button } from '@kobato/ui/components/button'
import { Input } from '@kobato/ui/components/input'
import { Label } from '@kobato/ui/components/label'
import { cn } from '@kobato/ui/lib/cn'
import { ImagePlusIcon, LinkIcon, SparklesIcon, XIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'

export interface ImageFieldProps {
  id: string
  label: string
  /** Current override URL. Empty string ⇒ "use default / unset". */
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  aspect: string
  urlPlaceholder: string
  emptyContent?: ReactNode
  emptyHint?: string
}

export function ImageField({
  id,
  label,
  value,
  onChange,
  disabled,
  aspect,
  urlPlaceholder,
  emptyContent,
  emptyHint,
}: ImageFieldProps) {
  const [showUrl, setShowUrl] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [droppedFile, setDroppedFile] = useState<File | null>(null)
  const handlePick = (image: AdminImageDto) => onChange(image.publicUrl)
  const hasValue = value !== ''

  const handleDragOver = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }
  const handleDragEnter = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) {
      setDragActive(true)
    }
  }
  const handleDragLeave = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
  }
  const handleDrop = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (disabled) {
      return
    }
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) {
      setDroppedFile(file)
      setUploadOpen(true)
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label>
          {label} <span className="text-xs font-normal text-muted-foreground">（可选）</span>
        </Label>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            type="button"
            title={showUrl ? '收起 URL 输入' : '粘贴 URL'}
            aria-label={showUrl ? `收起 ${label} 的 URL 输入` : `粘贴 ${label} 的 URL`}
            aria-pressed={showUrl}
            onClick={() => setShowUrl((prev) => !prev)}
            disabled={disabled}
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
              disabled={disabled}
            >
              <XIcon />
            </Button>
          ) : null}
        </div>
      </div>
      <ImageLibraryPicker
        trigger={
          <button
            type="button"
            disabled={disabled}
            aria-label={hasValue ? `替换 ${label}` : `选择 ${label}`}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              'group relative block w-full overflow-hidden rounded-xl border bg-muted/30',
              aspect,
              'transition focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
              disabled
                ? 'cursor-not-allowed opacity-60'
                : 'cursor-pointer hover:border-primary hover:ring-2 hover:ring-primary/30',
              dragActive && 'border-primary ring-2 ring-primary/30',
            )}
          >
            {hasValue ? (
              <img
                src={value}
                alt={`${label} 预览`}
                loading="lazy"
                decoding="async"
                className="size-full object-cover"
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).style.visibility = 'hidden'
                }}
              />
            ) : emptyContent !== undefined ? (
              emptyContent
            ) : (
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <ImagePlusIcon className="size-6" />
                <span className="text-xs">点击选择 / 上传</span>
              </span>
            )}
            <span
              className={cn(
                'pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 text-xs font-medium text-white opacity-0 transition',
                'group-hover:opacity-100 group-focus-visible:opacity-100',
              )}
            >
              {hasValue ? '点击替换' : '点击选择'}
            </span>
          </button>
        }
        onPick={handlePick}
      />
      {!hasValue && emptyHint !== undefined ? <p className="text-xs text-muted-foreground">{emptyHint}</p> : null}
      {showUrl ? (
        <Input
          id={`${id}-url`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={urlPlaceholder}
          maxLength={500}
          disabled={disabled}
        />
      ) : hasValue ? (
        <p className="truncate font-mono text-xs text-muted-foreground" title={value}>
          {value}
        </p>
      ) : null}
      <UploadImageDialog
        open={uploadOpen}
        kind={{ kind: 'generic' }}
        initialFile={droppedFile ?? undefined}
        onClose={() => {
          setDroppedFile(null)
          setUploadOpen(false)
        }}
        onUploaded={(image) => {
          setDroppedFile(null)
          onChange(image.publicUrl)
          setUploadOpen(false)
        }}
      />
    </div>
  )
}

export interface GeneratedOgPreviewProps {
  /** Persisted slug (the URL slot of `/images/og/:slug.png`). */
  slug: string
  /** Editor-side cover URL — folded into the cache-buster so the preview refreshes when the operator swaps covers. */
  cover: string
  /** Editor-side title — folded into the cache-buster for the same reason as `cover`. */
  title: string
  /** Editor-side summary — same reason. */
  summary: string
}

export function GeneratedOgPreview({ slug, cover, title, summary }: GeneratedOgPreviewProps) {
  const buster = djb2Short(`${title}${summary}${cover}`)
  const src = `/images/og/${encodeURIComponent(slug)}.png?_=${buster}`
  return (
    <>
      <img
        src={src}
        alt="默认生成的 OG 预览"
        loading="lazy"
        decoding="async"
        className="size-full object-cover"
        onError={(e) => {
          ;(e.currentTarget as HTMLImageElement).style.visibility = 'hidden'
        }}
      />
      <Badge variant="secondary" className="pointer-events-none absolute top-1.5 left-1.5 gap-1">
        <SparklesIcon className="size-3" /> 默认生成
      </Badge>
    </>
  )
}

function djb2Short(input: string): string {
  let hash = 5381
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i)
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 8)
}
