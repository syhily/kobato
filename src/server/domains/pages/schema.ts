import { z } from 'zod'

import { portableTextBodySchema } from '@/shared/pt/schema'
import { safeBoolean } from '@/shared/utils/schema'

// `slug()` enforces the same kebab-case-ASCII shape `service.ts` checks
// at the business-logic layer. Validation happens here too so the API
// envelope speaks Zod's vocabulary on a malformed input — the service
// layer's own check is a defence-in-depth fallback (callers can save
// and bypass HTTP). Pages historically allowed `[._-]` separators (so
// `archives.html` and `about_us` legacy URLs survive the migration);
// the auto-derived value (`deriveSlug(title)`) only emits `-`, which
// is a strict subset of the allowed shape.
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

const idSchema = z.object({
  id: z.string().min(1),
})

// Search params come in as strings, so we coerce numeric fields and
// booleans before handing them to the service layer.
export const listPagesSchema = z.object({
  q: z.string().trim().max(100).optional(),
  deletedStatus: z.enum(['all', 'deleted', 'normal']).optional().default('normal'),
  published: z.coerce.boolean().optional(),
  authorId: z.coerce.bigint().optional(),
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

export const getPageSchema = idSchema
export const deletePageSchema = idSchema
export const restorePageSchema = idSchema
export const unpublishPageSchema = idSchema
export const listPageRevisionsSchema = idSchema

// Optional fields are normalised to safe defaults at the schema level
// so the service layer's UpsertPageMetaInput always sees fully-shaped
// values. `cover` is allowed to be empty (admin can publish a page
// without a cover image — covers are optional in `ClientPage`).
//
// `slug` is wire-optional. When omitted (or empty), the service
// derives one from `title` via `deriveSlug` — the same pinyin-pro ->
// github-slugger pipeline tags and categories use. Authors only have
// to think about a slug when they want a custom URL (e.g. `about-us`
// for a page titled "我们是谁").
export const upsertPageMetaSchema = z.object({
  id: z.string().min(1).optional(),
  slug: slugSchema.optional(),
  title: z.string().trim().min(1).max(200),
  summary: optionalText(500),
  cover: z.string().trim().max(500).optional().default(''),
  // `og` is nullable on the wire (admin can clear a previously-set
  // value). Trim + empty-string collapses to null so DB keeps a
  // single canonical "absent" representation.
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
  showFriends: safeBoolean().optional(),
  publishedAt: z.iso.datetime({ offset: true }).optional(),
})

// Save / publish share the same input shape — the difference lives in
// which resource route the editor POSTs to. We pull `body` through
// `portableTextBodySchema` here so a malformed save fails at the
// API perimeter (400) rather than reaching the transactional service
// layer (which then has to translate the same Zod issues anyway).
export const savePageBodySchema = z.object({
  id: z.string().min(1),
  body: portableTextBodySchema,
  expectedClientRevisionToken: z.uuid().nullable().optional(),
  force: safeBoolean().optional(),
  // Optional publish target. Only `publishLatest` honours this; the
  // draft path ignores it (the metadata save endpoint owns
  // `publishedAt` for non-publish edits). When omitted, publish
  // sets `publishedAt = now()` so the page goes live immediately.
  // When the supplied timestamp is in the future, the page is
  // promoted but the catalog filter (`publishedAt <= now()`) keeps
  // it hidden until the time arrives — that's the "定时发布" path.
  publishedAt: z.iso.datetime({ offset: true }).optional(),
})

// `previewPage` is a read-only render path, but it still needs the
// body validator because the editor sends the whole document.
export const previewPageBodySchema = z.object({
  body: portableTextBodySchema,
})

// Editor inline-math preview. The bubble-menu panel debounces and POSTs
// the typing buffer here. The 4KB cap is generous: even a multi-line
// `align*` block tops out a few hundred bytes; nothing legitimately
// math-related approaches the limit. Anything longer than that is
// either a malformed input (the editor's own popover would refuse to
// open) or a payload-flood attempt — both of which deserve a 400.
export const renderMathSchema = z.object({
  tex: z.string().max(4 * 1024, 'TeX 表达式过长'),
  display: safeBoolean(),
})
