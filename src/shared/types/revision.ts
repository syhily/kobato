import type { PortableTextBody } from '@/shared/pt/schema'
import type { MarkdownHeading } from '@/shared/utils/toc'

export interface AdminRevisionDto {
  id: string
  revisionNo: number
  status: 'draft' | 'published'
  body: PortableTextBody
  imageSources: string[]
  headings: MarkdownHeading[]
  authorId: string | null
  clientRevisionToken: string
  createdAt: string
  updatedAt: string
}
