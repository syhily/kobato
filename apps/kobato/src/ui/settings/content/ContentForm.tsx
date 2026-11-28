import { ContentFeedCard } from '@/ui/settings/content/ContentFeedCard'
import { ContentFootnotesCard } from '@/ui/settings/content/ContentFootnotesCard'
import { ContentPaginationCard } from '@/ui/settings/content/ContentPaginationCard'
import { ContentSortCard } from '@/ui/settings/content/ContentSortCard'
import { type ContentFormProps } from '@/ui/settings/content/model'

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
