import { makeContentEntityAdapter } from '../../content/entities/lifecycle-adapter'
import { postDescriptor } from '../descriptor'

// The body-lifecycle adapter folds into the entity descriptor — one
// declaration drives both the revision pipeline and the meta CRUD skeleton.
export const postLifecycleAdapter = makeContentEntityAdapter(postDescriptor)
