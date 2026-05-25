import type { ContentSettings } from '@/shared/config/types'

const DEFAULT_FOOTNOTES_SECTION_TITLE = '尾声礼记'

/** Visible `<h3>` above the Portable Text footnotes list (`blog.content.footnotes.sectionTitle`). */
export function resolveFootnotesSectionTitle(content: ContentSettings): string {
  const title = content.footnotes?.sectionTitle?.trim()
  return title !== undefined && title.length > 0 ? title : DEFAULT_FOOTNOTES_SECTION_TITLE
}
