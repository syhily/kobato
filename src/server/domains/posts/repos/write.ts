import type { NewPostMeta, PostMetaRow } from '@/server/infra/db/types'

import { makeMetaCrud } from '@/server/domains/content/entities/meta-repo'
import { post as postMetaTable } from '@/server/infra/db/schema/post'

// No post-specific fork: writes come from the shared meta CRUD
// (`content/entities/meta-repo.ts`) bound to the post table.
const crud = makeMetaCrud<PostMetaRow, NewPostMeta>(postMetaTable)

export const insertPostMeta = crud.insertMeta
export const updatePostMetaById = crud.updateMetaById
export const softDeletePostMeta = crud.softDeleteMeta
export const restorePostMeta = crud.restoreMeta
