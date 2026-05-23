export interface DraftSummary {
  id: string
  title: string
  updatedAtIso: string
}

export interface MyCommentSummary {
  id: string
  excerpt: string
  createdAtIso: string
  isPending: boolean
  entity: { title: string; permalink: string } | null
}
