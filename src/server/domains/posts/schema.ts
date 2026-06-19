import { z } from 'zod'

import { inklingDocumentSchema } from '@/shared/inkling/schema'
import { safeBoolean } from '@/shared/utils/schema'

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/, 'Invalid slug')

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value ?? '')

const idSchema = z.object({ id: z.string().min(1) })

export const listPostsSchema = z.object({
  q: z.string().trim().max(100).optional(),
  deletedStatus: z.enum(['all', 'deleted', 'normal']).optional().default('normal'),
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  category: z.string().trim().max(20).optional(),
  tag: z.string().trim().max(20).optional(),
  published: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : v))
    .optional(),
  visible: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : v))
    .optional(),
  sortBy: z.enum(['publishedAt', 'updatedAt']).optional().default('publishedAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  authorId: z.coerce.bigint().optional(),
})

export const getPostSchema = idSchema
export const deletePostSchema = idSchema
export const restorePostSchema = idSchema
export const unpublishPostSchema = idSchema
export const listPostRevisionsSchema = idSchema

export const upsertPostMetaSchema = z.object({
  id: z.string().min(1).optional(),
  slug: slugSchema.optional(),
  title: z.string().trim().min(1).max(200),
  summary: optionalText(500),
  cover: z.string().trim().max(500).optional().default(''),
  og: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .transform((value) => (value === undefined || value === '' ? null : value)),
  published: safeBoolean().optional(),
  commentsEnabled: safeBoolean().optional(),
  showToc: safeBoolean().optional(),
  showUpdated: safeBoolean().optional(),
  visible: safeBoolean().optional(),
  pinnedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  publishedAt: z.iso.datetime({ offset: true }).optional(),
  category: z.string().trim().max(20).optional().default(''),
  tags: z.array(z.string().trim().max(20)).optional().default([]),
  alias: z
    .array(
      z
        .string()
        .trim()
        .max(80)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid alias slug'),
    )
    .optional()
    .default([]),
})

export const savePostBodySchema = z.object({
  id: z.string().min(1),
  body: inklingDocumentSchema,
  expectedClientRevisionToken: z.uuid().nullable().optional(),
  force: safeBoolean().optional(),
  publishedAt: z.iso.datetime({ offset: true }).optional(),
})

export const previewPostBodySchema = z.object({
  body: inklingDocumentSchema,
})
