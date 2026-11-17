import type { NewPostMeta, PostMetaRow } from '../../../infra/db/types'

import { post as postMetaTable } from '../../../infra/db/schema/post'
import { makeMetaCrud } from '../../content/entities/meta-repo'

// No post-specific fork: writes come from the shared meta CRUD
// (`content/entities/meta-repo.ts`) bound to the post table.
const crud = makeMetaCrud<PostMetaRow, NewPostMeta>(postMetaTable)

export const insertPostMeta = crud.insertMeta
export const updatePostMetaById = crud.updateMetaById
export const softDeletePostMeta = crud.softDeleteMeta
export const restorePostMeta = crud.restoreMeta
