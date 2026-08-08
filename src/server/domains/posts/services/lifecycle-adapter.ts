import { makeContentEntityAdapter } from '@/server/domains/content/entities/lifecycle-adapter'
import { postDescriptor } from '@/server/domains/posts/descriptor'

// The body-lifecycle adapter folds into the entity descriptor — one
// declaration drives both the revision pipeline and the meta CRUD skeleton.
export const postLifecycleAdapter = makeContentEntityAdapter(postDescriptor)
