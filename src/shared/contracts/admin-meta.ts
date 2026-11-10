import { z } from 'zod'

import { idString, isoDateTime } from '@/shared/contracts/primitives'

// Fields every content entity (post / page) shares, projected from the shared
// meta columns. Bigint ids are stringified — the admin contract declares
// strings up front. Entity DTOs `.extend()` this base with their own fields.
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
  // Opts the entity into rendering「修改于 XXXX」on the public detail page;
  // toggled from the editor meta sidebar, defaults `false`.
  showUpdated: z.boolean(),
  // Author-declared BCP 47 tag of the prose, CANONICALIZED on write (any
  // well-formed tag — not limited to the four UI locales). `null` renders no
  // `lang` on the body container, so it inherits the document language.
  contentLanguage: z.string().nullable(),
  publishedAt: isoDateTime,
  /** `null` while the entity has never been published. */
  publishedRevisionId: idString.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  /** When non-null the row is soft-deleted. */
  deletedAt: isoDateTime.nullable(),
  authorId: idString.nullable(),
  authorName: z.string().nullable(),
  // Approved comment count for the row's metric row. Populated by the admin
  // list endpoint; `0` on detail / save paths.
  commentCount: z.number().int().nonnegative(),
  // The row's `metric.public_id` UUID — the wire identifier the admin
  // comment-count link deep-links with. Empty on detail / save paths.
  commentPublicId: z.string(),
})
export type AdminMetaBaseDto = z.infer<typeof adminMetaBaseDto>
