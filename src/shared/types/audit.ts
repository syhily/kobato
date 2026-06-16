export interface AuditLogItemDto {
  id: string
  action: string
  actorId: string | null
  actorName: string | null
  actorRole: string | null
  resourceType: string
  resourceId: string | null
  details: Record<string, unknown> | null
  detailsHtml: string | null
  ipAddressMasked: string | null
  userAgentMasked: string | null
  createdAt: string
}

export interface AuditLogListInput {
  offset: number
  limit: number
  action?: string
  resourceType?: string
  actorId?: string
  ip?: string
  dateFrom?: string
  dateTo?: string
}

export interface AuditLogListOutput {
  items: AuditLogItemDto[]
  total: number
  hasMore: boolean
}

export interface AuditLogActorDto {
  actorId: string
  actorName: string
  email: string
}
