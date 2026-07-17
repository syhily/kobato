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

// Single statement of the post/page body-save wire shape. The server emits
// `warning` when a non-fatal side effect (image-library sync) failed — the
// editor surfaces it instead of swallowing it. Parity-pinned against the
// zod contracts in `@/shared/contracts/revision`.
export interface SaveBodyInput {
  id: string
  body: PortableTextBody
  expectedClientRevisionToken?: string | null
  force?: boolean
  publishedAt?: string
}

export type SaveBodyOutput =
  | { status: 'saved'; revision: AdminRevisionDto; warning?: string }
  | { status: 'conflict'; latest: AdminRevisionDto; expectedToken: string; warning?: string }
