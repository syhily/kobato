import type { NewPostMeta, PostMetaRow } from '@kobato/server/infra/db/types'

import { makeMetaCrud } from '@kobato/server/domains/content/entities/meta-repo'
import { post as postMetaTable } from '@kobato/server/infra/db/schema/post'

// Meta-row writes come from the shared meta CRUD (`content/entities/meta-repo.ts`)
// bound to the post table — no post-specific fork of these queries exists.
const crud = makeMetaCrud<PostMetaRow, NewPostMeta>(postMetaTable)

export const insertPostMeta = crud.insertMeta
export const updatePostMetaById = crud.updateMetaById
export const softDeletePostMeta = crud.softDeleteMeta
export const restorePostMeta = crud.restoreMeta
