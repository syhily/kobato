import type { NewPostMeta, PostMetaRow } from '@kobato/db/types.ts'

import { post as postMetaTable } from '@kobato/db/schema/post.ts'
import { makeMetaCrud } from '@kobato/server/domains/content/entities/meta-repo.ts'

// No post-specific fork: writes come from the shared meta CRUD
// (`content/entities/meta-repo.ts`) bound to the post table.
const crud = makeMetaCrud<PostMetaRow, NewPostMeta>(postMetaTable)

export const insertPostMeta = crud.insertMeta
export const updatePostMetaById = crud.updateMetaById
export const softDeletePostMeta = crud.softDeleteMeta
export const restorePostMeta = crud.restoreMeta
