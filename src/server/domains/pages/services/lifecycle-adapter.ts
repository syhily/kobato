import { makeContentEntityAdapter } from '@/server/domains/content/entities/lifecycle-adapter'
import { pageDescriptor } from '@/server/domains/pages/descriptor'

// `pages/descriptor.ts` is the single declaration driving both the revision pipeline and the meta CRUD.
export const pageLifecycleAdapter = makeContentEntityAdapter(pageDescriptor)
