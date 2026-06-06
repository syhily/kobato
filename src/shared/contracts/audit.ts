import { z } from 'zod'

// Audit Log DTOs

export const auditLogItemDto = z.object({
  id: z.string(),
  action: z.string(),
  actorId: z.string().nullable(),
  actorName: z.string().nullable(),
  actorRole: z.string().nullable(),
  resourceType: z.string(),
  resourceId: z.string().nullable(),
  details: z.record(z.string(), z.unknown()).nullable(),
  ipAddressMasked: z.string().nullable(),
  userAgentMasked: z.string().nullable(),
  createdAt: z.string(), // ISO-8601
})

export const auditLogListInput = z.object({
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(20),
  action: z.string().trim().max(50).optional(),
  resourceType: z.string().trim().max(50).optional(),
  actorId: z.string().trim().optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
})

export const auditLogListOutput = z.object({
  items: z.array(auditLogItemDto),
  total: z.number().int(),
  hasMore: z.boolean(),
})

export const auditLogActorDto = z.object({
  actorId: z.string(),
  actorName: z.string(),
  email: z.string(),
})

export const auditLogActorsOutput = z.array(auditLogActorDto)

export type AuditLogItemDto = z.infer<typeof auditLogItemDto>
export type AuditLogListInput = z.infer<typeof auditLogListInput>
export type AuditLogListOutput = z.infer<typeof auditLogListOutput>
export type AuditLogActorDto = z.infer<typeof auditLogActorDto>
