import { makeContentEntityAdapter } from '@kobato/server/domains/content/entities/lifecycle-adapter.ts'
import { postDescriptor } from '@kobato/server/domains/posts/descriptor.ts'

// The body-lifecycle adapter folds into the entity descriptor — one
// declaration drives both the revision pipeline and the meta CRUD skeleton.
export const postLifecycleAdapter = makeContentEntityAdapter(postDescriptor)
