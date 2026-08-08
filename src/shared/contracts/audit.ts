import { z } from 'zod'

export const auditLogItemDto = z.object({
  id: z.string(),
  action: z.string(),
  actorId: z.string().nullable(),
  actorName: z.string().nullable(),
  actorRole: z.string().nullable(),
  resourceType: z.string(),
  resourceId: z.string().nullable(),
  details: z.record(z.string(), z.unknown()).nullable(),
  detailsHtml: z.string().nullable(),
  ipAddressMasked: z.string().nullable(),
  userAgentMasked: z.string().nullable(),
  createdAt: z.string(), // ISO-8601
})
export type AuditLogItemDto = z.infer<typeof auditLogItemDto>

export const auditLogListInput = z.object({
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(20),
  action: z.string().trim().max(50).optional(),
  resourceType: z.string().trim().max(50).optional(),
  actorId: z.string().trim().optional(),
  ip: z.string().trim().max(100).optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
})
export type AuditLogListInput = z.infer<typeof auditLogListInput>

export const auditLogExportInput = auditLogListInput.omit({ offset: true, limit: true }).extend({
  includeFullIp: z.boolean().optional(),
})

export const auditLogListOutput = z.object({
  items: z.array(auditLogItemDto),
  total: z.number().int(),
  hasMore: z.boolean(),
})
export type AuditLogListOutput = z.infer<typeof auditLogListOutput>

export const auditLogActorDto = z.object({
  actorId: z.string(),
  actorName: z.string(),
  email: z.string(),
})
export type AuditLogActorDto = z.infer<typeof auditLogActorDto>

export const auditLogActorsOutput = z.array(auditLogActorDto)
