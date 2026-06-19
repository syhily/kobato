import type { InklingDocument } from '@/shared/inkling/schema'
import type { MarkdownHeading } from '@/shared/utils/toc'

export interface AdminRevisionDto {
  id: string
  revisionNo: number
  status: 'draft' | 'published'
  body: InklingDocument
  imageSources: string[]
  headings: MarkdownHeading[]
  authorId: string | null
  clientRevisionToken: string
  createdAt: string
  updatedAt: string
}
