import { makeContentEntityAdapter } from '@kobato/server/domains/content/entities/lifecycle-adapter'
import { postDescriptor } from '@kobato/server/domains/posts/descriptor'

// The body-lifecycle adapter folds into the entity descriptor — one
// declaration (`posts/descriptor.ts`) drives both the revision pipeline
// and the meta CRUD skeleton.
export const postLifecycleAdapter = makeContentEntityAdapter(postDescriptor)
