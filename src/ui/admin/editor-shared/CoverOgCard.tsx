import { GeneratedOgPreview, ImageField } from '@/ui/admin/editor-shared/ImageField'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/components/card'

export interface CoverOgCardProps {
  /** Field ids (`post-cover` / `page-cover`, …) — keep the label htmlFor wiring stable. */
  coverId: string
  ogId: string
  /** Display noun used in the pre-save OG hint (文章 / 页面). */
  entityLabel: string
  cover: string
  onCoverChange: (value: string) => void
  og: string
  onOgChange: (value: string) => void
  /** Editor-side title / summary — folded into the generated-OG preview cache-buster. */
  title: string
  summary: string
  /**
   * Persisted slug used to render the generated `/images/og/:slug.png`
   * preview when the OG override is empty. Empty ⇒ pre-save hint instead.
   */
  ogPreviewSlug?: string | null
  disabled?: boolean
}

export function CoverOgCard({
  coverId,
  ogId,
  entityLabel,
  cover,
  onCoverChange,
  og,
  onOgChange,
  title,
  summary,
  ogPreviewSlug,
  disabled,
}: CoverOgCardProps) {
  const previewSlug = ogPreviewSlug ?? ''

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">封面 / OG 图</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-xs text-muted-foreground">
          两项均为可选。封面用于列表与文章顶部展示；OG 图供社交平台分享卡片使用，留空则回退到默认生成的 OG 卡片。
        </p>
        <ImageField
          id={coverId}
          label="封面图"
          value={cover}
          onChange={onCoverChange}
          disabled={disabled}
          aspect="aspect-[16/9]"
          urlPlaceholder="https://… 或从图片库挑选"
          emptyHint="点击此处上传封面，或粘贴一张图片 URL。"
        />
        <ImageField
          id={ogId}
          label="OG 图"
          value={og}
          onChange={onOgChange}
          disabled={disabled}
          aspect="aspect-[1200/630]"
          urlPlaceholder="留空则使用默认生成的 OG"
          emptyContent={
            previewSlug !== '' ? (
              <GeneratedOgPreview slug={previewSlug} cover={cover} title={title} summary={summary} />
            ) : undefined
          }
          emptyHint={
            previewSlug !== ''
              ? '当前展示的是默认生成的 OG。点击图片可上传一张专属 OG 覆盖。'
              : `${entityLabel}首次保存后，这里会展示默认生成的 OG 预览。也可现在点击上传一张专属 OG。`
          }
        />
      </CardContent>
    </Card>
  )
}
