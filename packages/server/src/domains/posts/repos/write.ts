import type { NewPostMeta, PostMetaRow } from '@kobato/db/types'

import { post as postMetaTable } from '@kobato/db/schema/post'
import { makeMetaCrud } from '@kobato/server/domains/content/entities/meta-repo'

const crud = makeMetaCrud<PostMetaRow, NewPostMeta>(postMetaTable)

export const insertPostMeta = crud.insertMeta
export const updatePostMetaById = crud.updateMetaById
export const softDeletePostMeta = crud.softDeleteMeta
export const restorePostMeta = crud.restoreMeta
