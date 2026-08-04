import { cn } from '@kobato/ui/lib/cn'
import { ExternalLinkIcon, XIcon } from 'lucide-react'
import { Link } from 'react-router'

export interface ActionBannerProps {
  kind: 'draft' | 'published'
  slug: string
  /** Full link base (frontend origin + path prefix; same-origin when empty). */
  linkPrefix: string
  /** Bare `key=value` preview-token query appended to the link ('' when same-origin). */
  previewQuery: string
  onClose: () => void
}

// Shown after a save flow succeeds. The operator dismisses it manually; a
// follow-up successful action replaces the banner in place.
export function ActionBanner({ kind, slug, linkPrefix, previewQuery, onClose }: ActionBannerProps) {
  // The draft link needs BOTH `?draft=true` (the route's draft marker) and
  // the preview token (the cross-domain draft credential); the published
  // link carries only the token.
  const draftQuery = kind === 'draft' ? '?draft=true' : ''
  const tokenSuffix = previewQuery === '' ? '' : kind === 'draft' ? `&${previewQuery}` : `?${previewQuery}`
  const href = `${linkPrefix}/${slug}${draftQuery}${tokenSuffix}`
  const message =
    kind === 'draft'
      ? '草稿已保存，可通过下方链接预览最新内容（仅管理员可见草稿）：'
      : '草稿已发布，可通过下方链接访问最新内容：'
  const themeClass =
    kind === 'draft'
      ? 'border-status-warn-border/30 bg-status-warn-bg text-status-warn-fg'
      : 'border-status-success-border/30 bg-status-success-bg text-status-success-fg'
  const closeBtnClass =
    kind === 'draft'
      ? 'text-status-warn-fg/80 hover:bg-status-warn-border/20 hover:text-status-warn-fg'
      : 'text-status-success-fg/80 hover:bg-status-success-border/20 hover:text-status-success-fg'
  return (
    <output className={cn('flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs', themeClass)}>
      <span>{message}</span>
      <Link to={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono underline">
        <ExternalLinkIcon className="size-3" />
        {href}
      </Link>
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭提示"
        title="关闭提示"
        className={cn('ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5', closeBtnClass)}
      >
        <XIcon className="size-3.5" />
        <span>关闭</span>
      </button>
    </output>
  )
}
