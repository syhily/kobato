import { ExternalLinkIcon, XIcon } from 'lucide-react'
import { Link } from 'react-router'

import { cn } from '@/ui/lib/cn'
import { useI18n } from '@/ui/lib/I18nProvider'

export interface ActionBannerProps {
  kind: 'draft' | 'published'
  slug: string
  basePath: string
  onClose: () => void
}

// Post-save banner — manually dismissed; a follow-up successful action replaces it in place.
export function ActionBanner({ kind, slug, basePath, onClose }: ActionBannerProps) {
  const { t } = useI18n()
  const href = kind === 'draft' ? `${basePath}/${slug}?draft=true` : `${basePath}/${slug}`
  const message = kind === 'draft' ? t('admin.editor.banner.draft') : t('admin.editor.banner.published')
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
        aria-label={t('admin.editor.banner.closeAria')}
        title={t('admin.editor.banner.closeAria')}
        className={cn('ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5', closeBtnClass)}
      >
        <XIcon className="size-3.5" />
        <span>{t('common.action.close')}</span>
      </button>
    </output>
  )
}
