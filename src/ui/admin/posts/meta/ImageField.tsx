import { ImagePlusIcon, LinkIcon, SparklesIcon, XIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import type { AdminImageDto } from '@/shared/types/images'

import { ImageLibraryPicker } from '@/ui/admin/editor/pickers/ImageLibraryPicker'
import { UploadImageDialog } from '@/ui/admin/shared/UploadImageDialog'
import { Badge } from '@/ui/components/badge'
import { Button } from '@/ui/components/button'
import { Input } from '@/ui/components/input'
import { Label } from '@/ui/components/label'
import { cn } from '@/ui/lib/cn'

export interface ImageFieldProps {
  id: string
  label: string
  /** Current override URL. Empty string ⇒ "use default / unset". */
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  /**
   * Tailwind aspect class controlling the click-target shape. Cover
   * fields use `aspect-[16/9]` (the list-card preview shape); OG
   * fields use `aspect-[1200/630]` (the default OG render dimensions
   * declared in `setting('blog.seo')`). Hard-coding the aspect at
   * the call site keeps every preview tile pixel-perfect for its
   * downstream surface.
   */
  aspect: string
  /** Placeholder shown inside the collapsed "粘贴 URL" `<input>`. */
  urlPlaceholder: string
  /**
   * Optional empty-state surface rendered *inside* the click target
   * when `value === ''`. The OG field uses this to drop the live
   * `<GeneratedOgPreview />` underneath the click overlay so the
   * operator sees the auto-generated OG card and can click anywhere
   * on it to override. When omitted, the empty-state shows a
   * plus-icon placeholder.
   */
  emptyContent?: ReactNode
  /**
   * One-line hint rendered below the click target. Cover and OG use
   * this to explain the click affordance and (for OG) to clarify
   * whether the displayed preview is a generated default or the
   * operator's override.
   */
  emptyHint?: string
}

// Image-first metadata field: the entire aspect-ratio'd surface is a
// click target that opens the library picker. Storing a plain URL
// keeps the existing wire shape (`AdminPostDto.cover`/`og` are
// strings) and lets operators paste a CDN-hosted asset that isn't
// tracked in the image library by toggling the "粘贴 URL" affordance
// in the header.
//
// State machine:
//   1. `value !== ''`         → render the override image, full bleed.
//                                Header shows 替换 / 清空; clicking the
//                                image surface opens the picker.
//   2. `value === ''` + `emptyContent` provided → render `emptyContent`
//                                 (the generated-OG preview, in our
//                                 OG case) under a transparent click
//                                 overlay; header shows 替换 only.
//   3. `value === ''` + no `emptyContent` → dashed placeholder with a
//                                 plus icon; entire surface clicks
//                                 through to the picker.
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
  /** Persisted slug of the post (the URL slot of `/images/og/:slug.png`). */
  slug: string
  /** Editor-side cover URL — folded into the cache-buster so the preview refreshes when the operator swaps covers. */
  cover: string
  /** Editor-side title — folded into the cache-buster for the same reason as `cover`. */
  title: string
  /** Editor-side summary — same reason. */
  summary: string
}

// Live preview of the auto-generated OG card. Rendered inside the
// OG `ImageField`'s empty-state slot. The image source includes a
// `?_=<short-hash>` cache-buster derived from the editor draft so a
// title / summary / cover change in the metadata pane forces the
// browser to fetch the freshly-generated OG instead of reusing the
// previous tile (the server-side cache already keys on the same
// inputs via `ogCacheKey`, so this just bypasses the browser's
// memory cache, not the Redis layer).
export function GeneratedOgPreview({ slug, cover, title, summary }: GeneratedOgPreviewProps) {
  const buster = djb2Short(`${title}${summary}${cover}`)
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

// Tiny non-cryptographic hash used purely as a per-input browser
// cache buster for the generated OG preview. We deliberately avoid
// importing a crypto helper here because the value is never compared
// against anything server-side — collisions only cause a missed
// preview refresh, which the operator can fix by re-clicking the
// image. djb2 is constant-memory, ~20 LOC, and produces 8 hex chars
// which is plenty of entropy for a debounce-grade buster.
function djb2Short(input: string): string {
  let hash = 5381
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i)
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 8)
}
