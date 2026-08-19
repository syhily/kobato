import { z } from 'zod'

import { idString, isoDateTime } from '@/shared/contracts/primitives'

// The admin-DTO fields every content entity (post / page) shares,
// projected from the shared meta columns. Bigint ids are stringified —
// the admin contract declares strings up front. The entity DTOs
// (`adminPostDto` / `adminPageDto`) `.extend()` this base with their
// entity-only fields; the server-side mapper is `toAdminMetaDto` in
// `@/server/domains/content/entities/projection`.
export const adminMetaBaseDto = z.object({
  id: idString,
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  cover: z.string(),
  og: z.string().nullable(),
  published: z.boolean(),
  commentsEnabled: z.boolean(),
  webmentionsEnabled: z.boolean(),
  showToc: z.boolean(),
  // Opts the entity into rendering「修改于 XXXX」on the public detail
  // page; toggled from the editor meta sidebar, defaults `false`.
  showUpdated: z.boolean(),
  /** ISO-8601. Editable from the metadata panel. */
  publishedAt: isoDateTime,
  /** `null` while the entity has never been published. */
  publishedRevisionId: idString.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  /** When non-null the row is soft-deleted. */
  deletedAt: isoDateTime.nullable(),
  authorId: idString.nullable(),
  authorName: z.string().nullable(),
  // Approved comment count for the row's metric row. Populated by
  // the admin list endpoint; `0` on detail / save paths.
  commentCount: z.number().int().nonnegative(),
  // The row's `metric.public_id` UUID — the wire identifier the admin
  // comment-count link deep-links with. Empty on detail / save paths.
  commentPublicId: z.string(),
})
export type AdminMetaBaseDto = z.infer<typeof adminMetaBaseDto>
