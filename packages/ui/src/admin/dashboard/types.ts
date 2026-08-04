export interface MyCommentSummary {
  id: string
  excerpt: string
  createdAtIso: string
  isPending: boolean
  entity: { title: string; permalink: string } | null
}
