import { ContentFeedCard } from '@kobato/web-admin/ui/settings/content/ContentFeedCard'
import { ContentFootnotesCard } from '@kobato/web-admin/ui/settings/content/ContentFootnotesCard'
import { ContentPaginationCard } from '@kobato/web-admin/ui/settings/content/ContentPaginationCard'
import { ContentSortCard } from '@kobato/web-admin/ui/settings/content/ContentSortCard'
import { type ContentFormProps } from '@kobato/web-admin/ui/settings/content/model'

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
