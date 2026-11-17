import { makeContentEntityAdapter } from '../../content/entities/lifecycle-adapter'
import { pageDescriptor } from '../descriptor'

// `pages/descriptor.ts` is the single declaration driving both the revision pipeline and the meta CRUD.
export const pageLifecycleAdapter = makeContentEntityAdapter(pageDescriptor)
