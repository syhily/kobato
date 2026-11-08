import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { GeneratedOgPreview, ImageField } from '@/ui/admin/editor-shared/ImageField'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/components/card'
import { useI18n } from '@/ui/lib/I18nProvider'

export interface CoverOgCardProps {
  /** Field ids (`post-cover` / `page-cover`, …) — keep the label htmlFor wiring stable. */
  coverId: string
  ogId: string
  /** Display-noun message id used in the pre-save OG hint (`admin.editor.entity.*`). */
  entityLabelId: UiMessageId
  cover: string
  onCoverChange: (value: string) => void
  og: string
  onOgChange: (value: string) => void
  /** Editor-side title / summary — folded into the generated-OG preview cache-buster. */
  title: string
  summary: string
  /** Persisted slug for the generated `/images/og/:slug.png` preview; empty ⇒ pre-save hint. */
  ogPreviewSlug?: string | null
  disabled?: boolean
}

export function CoverOgCard({
  coverId,
  ogId,
  entityLabelId,
  cover,
  onCoverChange,
  og,
  onOgChange,
  title,
  summary,
  ogPreviewSlug,
  disabled,
}: CoverOgCardProps) {
  const { t } = useI18n()
  const entity = t(entityLabelId)
  const previewSlug = ogPreviewSlug ?? ''

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('admin.editor.coverOg.title')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-xs text-muted-foreground">{t('admin.editor.coverOg.description')}</p>
        <ImageField
          id={coverId}
          label={t('admin.editor.coverOg.coverLabel')}
          value={cover}
          onChange={onCoverChange}
          disabled={disabled}
          aspect="aspect-[16/9]"
          urlPlaceholder={t('admin.editor.coverOg.coverUrlPlaceholder')}
          emptyHint={t('admin.editor.coverOg.coverEmptyHint')}
        />
        <ImageField
          id={ogId}
          label={t('admin.editor.coverOg.ogLabel')}
          value={og}
          onChange={onOgChange}
          disabled={disabled}
          aspect="aspect-[1200/630]"
          urlPlaceholder={t('admin.editor.coverOg.ogUrlPlaceholder')}
          emptyContent={
            previewSlug !== '' ? (
              <GeneratedOgPreview slug={previewSlug} cover={cover} title={title} summary={summary} />
            ) : undefined
          }
          emptyHint={
            previewSlug !== ''
              ? t('admin.editor.coverOg.ogGeneratedHint')
              : t('admin.editor.coverOg.ogPreSaveHint', { entity })
          }
        />
      </CardContent>
    </Card>
  )
}
