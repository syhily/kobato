/**
 * The Content API contract — the SDK's self-contained typed surface for
 * core's `/rpc` mount (and the `/api/content/v1` REST face it mirrors).
 *
 * This is an oRPC **contract router** (`@orpc/contract`): declarations
 * only, no implementation. The typed client (`client.ts`) is derived from
 * it via `ContractRouterClient`, and the server's real procedures are
 * pinned to it by the contract-consistency test — the two sides can never
 * drift apart without a red test.
 *
 * Wire paths are copied from the server controllers:
 *   - `content.*` procedures answer under `/rpc/content/<...>`
 *     (server router key `content`, REST path `/content/v1/...`)
 *   - `comments.*` procedures answer under `/rpc/comments/<...>`
 *     (server router key `comments`, REST path `/content/v1/comments/...`)
 * The client transport rewrites between the two prefixes (see
 * `apps/public/src/routes/public/client.ts`).
 *
 * Input schemas are exact copies of the server-side zod expressions
 * (validation refinements dropped — only the inferred types matter here);
 * output types for the loader-backed procedures come from `types.ts`.
 */

import {
  commentItemDto,
  publicWebmentionDto,
  type ArchivesOutput,
  type Category,
  type CategoryDetailOutput,
  type CommentItemWire,
  type Comments,
  type LayoutOutput,
  type LatestComment,
  type LexicalCommentBody,
  type ListingPageLoaderData,
  type PageDetailOutput,
  type PostDetailOutput,
  type RedirectPayload,
  type TagDetailOutput,
  type HomeExtra,
} from '@kobato/sdk/types'
import { oc, type as typeSchema } from '@orpc/contract'
import { z } from 'zod'

// Comment bodies are the Lexical comment dialect since R5b — a
// `z.custom` type carrier (the SDK re-expresses the server's
// `lexicalCommentBodySchema` type-faithfully; runtime validation happens
// server-side).
export const lexicalCommentBodySchema = z.custom<LexicalCommentBody>()

// ─── input schemas (source: the server http controllers) ───────────

// the shared `safe-url` util's `httpUrlOrEmptyStringSchema` —
// type-faithful re-expression (refine callbacks dropped).
const httpUrlSchema = z.url()
const httpUrlOrEmptyStringSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined) {
      return ''
    }
    if (typeof value !== 'string') {
      return value
    }
    const trimmed = value.trim()
    return trimmed === '' ? '' : trimmed
  },
  z.union([z.literal(''), httpUrlSchema]),
)

// `commentReplySchema` from the server comments domain —
// the honeypot `.superRefine` is dropped (type-neutral).
export const commentReplySchema = z.object({
  page_key: z.string(),
  name: z.string().max(100),
  email: z.email(),
  link: httpUrlOrEmptyStringSchema.optional(),
  body: lexicalCommentBodySchema,
  /** Retained for schema compatibility; no longer used. */
  rid: z.number().optional(),
  /** Leave blank — used for bot filtering only; stripped before `createComment`. */
  subtitle: z.string().max(240).optional().default(''),
})
export type CommentReplyInput = z.infer<typeof commentReplySchema>

export const commentRidSchema = z.object({
  rid: z.string().regex(/^\d+$/, { message: '评论 ID 必须是数字' }),
})
export type CommentRidInput = z.infer<typeof commentRidSchema>

// ─── content procedures (source: content-public.controller) ────────────────

export const contentPublicContract = {
  layout: oc.route({ method: 'GET', path: '/content/v1/layout' }).output(typeSchema<LayoutOutput>()),

  sidebar: oc
    .route({ method: 'GET', path: '/content/v1/sidebar' })
    .output(typeSchema<{ admin: boolean; recentComments: LatestComment[] }>()),

  listWebmentions: oc
    .route({ method: 'GET', path: '/content/v1/webmentions' })
    .input(z.object({ page_key: z.string() }))
    .output(z.object({ webmentions: z.array(publicWebmentionDto) })),

  postDetail: oc
    .route({ method: 'GET', path: '/content/v1/posts/:slug' })
    .input(z.object({ slug: z.string().min(1), previewToken: z.string().optional() }))
    .output(typeSchema<PostDetailOutput>()),

  pageDetail: oc
    .route({ method: 'GET', path: '/content/v1/pages/:slug' })
    .input(
      z.object({
        slug: z.string().min(1),
        wantsDraftPreview: z.boolean().optional(),
        previewToken: z.string().optional(),
      }),
    )
    .output(typeSchema<PageDetailOutput | RedirectPayload>()),

  search: oc
    .route({ method: 'GET', path: '/content/v1/search' })
    .input(z.object({ keyword: z.string().min(1), num: z.string().optional() }))
    .output(typeSchema<ListingPageLoaderData | RedirectPayload>()),

  home: oc
    .route({ method: 'GET', path: '/content/v1/home' })
    .input(z.object({ num: z.string().optional() }))
    .output(typeSchema<ListingPageLoaderData<HomeExtra> | RedirectPayload>()),

  categoryList: oc
    .route({ method: 'GET', path: '/content/v1/categories/:slug' })
    .input(z.object({ slug: z.string().min(1), num: z.string().optional() }))
    .output(typeSchema<ListingPageLoaderData | RedirectPayload>()),

  categoryDetail: oc
    .route({ method: 'GET', path: '/content/v1/categories/:slug/meta' })
    .input(z.object({ slug: z.string().min(1) }))
    .output(typeSchema<CategoryDetailOutput>()),

  tagList: oc
    .route({ method: 'GET', path: '/content/v1/tags/:slug' })
    .input(z.object({ slug: z.string().min(1), num: z.string().optional() }))
    .output(typeSchema<ListingPageLoaderData | RedirectPayload>()),

  tagDetail: oc
    .route({ method: 'GET', path: '/content/v1/tags/:slug/meta' })
    .input(z.object({ slug: z.string().min(1) }))
    .output(typeSchema<TagDetailOutput>()),

  allCategories: oc
    .route({ method: 'GET', path: '/content/v1/categories' })
    .output(typeSchema<{ categories: Category[] }>()),

  commentsTree: oc
    .route({ method: 'GET', path: '/content/v1/comments/tree' })
    .input(z.object({ page_key: z.string() }))
    .output(typeSchema<{ commentData: Comments | null; commentItems: CommentItemWire[] }>()),

  archives: oc.route({ method: 'GET', path: '/content/v1/archives' }).output(typeSchema<ArchivesOutput>()),
}

// ─── comments procedures (source: comments-{public,authed,token}.controller) ─

const ownCommentMutationDto = z.object({ comment: commentItemDto })

export const commentsPublicContract = {
  replyComment: oc
    .route({ method: 'POST', path: '/content/v1/comments/reply' })
    .input(commentReplySchema)
    .output(ownCommentMutationDto),

  loadComments: oc
    .route({ method: 'GET', path: '/content/v1/comments/list' })
    .input(z.object({ page_key: z.string(), offset: z.coerce.number() }))
    .output(z.object({ comments: z.array(commentItemDto), next: z.boolean() })),

  getRaw: oc
    .route({ method: 'GET', path: '/content/v1/comments/get-raw' })
    .input(commentRidSchema)
    .output(z.object({ body: lexicalCommentBodySchema })),

  edit: oc
    .route({ method: 'POST', path: '/content/v1/comments/edit' })
    .input(commentRidSchema.extend({ body: lexicalCommentBodySchema }))
    .output(ownCommentMutationDto),
}

export const commentsAuthedContract = {
  updateOwn: oc
    .route({ method: 'POST', path: '/comments/update-own' })
    .input(z.object({ commentId: z.string(), body: lexicalCommentBodySchema }))
    .output(ownCommentMutationDto),

  requestDeleteOwn: oc
    .route({ method: 'POST', path: '/comments/request-delete-own' })
    .input(z.object({ commentId: z.string() }))
    .output(ownCommentMutationDto),

  cancelDeleteOwn: oc
    .route({ method: 'POST', path: '/comments/cancel-delete-own' })
    .input(z.object({ commentId: z.string() }))
    .output(ownCommentMutationDto),

  loadMine: oc
    .route({ method: 'GET', path: '/comments/load-mine' })
    .input(
      z.object({
        offset: z.coerce.number().min(0).default(0),
        limit: z.coerce.number().min(1).max(100).default(20),
        status: z.enum(['all', 'pending', 'deleteRequested', 'deleted']).optional(),
        q: z.string().trim().max(200).optional(),
        entity: z.string().max(2048).optional(),
      }),
    )
    .output(
      z.object({
        items: z.array(
          z.object({
            id: z.string(),
            body: lexicalCommentBodySchema,
            createdAtIso: z.string(),
            deletedAtIso: z.string().nullable(),
            deleteRequestedAtIso: z.string().nullable(),
            isPending: z.boolean(),
            entity: z.object({ title: z.string(), permalink: z.string() }).nullable(),
            parent: z.object({ name: z.string(), excerpt: z.string(), isDeleted: z.boolean() }).nullable(),
          }),
        ),
        total: z.number().int(),
        hasMore: z.boolean(),
      }),
    ),

  searchMineEntities: oc
    .route({ method: 'GET', path: '/comments/search-mine-entities' })
    .input(z.object({ q: z.string().trim().max(100).optional() }))
    .output(z.object({ entities: z.array(z.object({ value: z.string(), label: z.string() })) })),
}

export const commentsTokenContract = {
  revokeToken: oc
    .route({ method: 'POST', path: '/comments/revoke-token' })
    .input(z.object({ rid: z.string() }))
    .output(z.object({ success: z.boolean() })),

  myComments: oc
    .route({ method: 'GET', path: '/comments/my-comments' })
    .input(z.object({ page_key: z.string() }))
    .output(z.object({ comments: z.array(commentItemDto), expiresAt: z.record(z.string(), z.number()) })),
}

/** The full Content API surface the SDK client types against — mirrors
 * `apiRouter.content & { comments: ... }` on the server side. */
export const contentPublicContractRouter = {
  ...contentPublicContract,
  comments: { ...commentsPublicContract, ...commentsAuthedContract, ...commentsTokenContract },
}

export type ContentPublicRouter = typeof contentPublicContractRouter
