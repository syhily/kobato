import { ContentFeedCard } from '@kobato/web-admin/ui/settings/content/ContentFeedCard.tsx'
import { ContentFootnotesCard } from '@kobato/web-admin/ui/settings/content/ContentFootnotesCard.tsx'
import { ContentPaginationCard } from '@kobato/web-admin/ui/settings/content/ContentPaginationCard.tsx'
import { ContentSortCard } from '@kobato/web-admin/ui/settings/content/ContentSortCard.tsx'
import { type ContentFormProps } from '@kobato/web-admin/ui/settings/content/model.ts'

export function ContentForm({ content }: ContentFormProps) {
  return (
    <div className="flex flex-col gap-5">
      <ContentPaginationCard content={content} />
      <ContentFeedCard content={content} />
      <ContentSortCard content={content} />
      <ContentFootnotesCard content={content} />
    </div>
  )
}
