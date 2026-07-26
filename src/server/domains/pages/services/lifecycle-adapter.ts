import { makeContentEntityAdapter } from '@/server/domains/content/entities/lifecycle-adapter'
import { pageDescriptor } from '@/server/domains/pages/descriptor'

// The body-lifecycle adapter folds into the entity descriptor — one
// declaration (`pages/descriptor.ts`) drives both the revision pipeline
// and the meta CRUD skeleton.
export const pageLifecycleAdapter = makeContentEntityAdapter(pageDescriptor)
