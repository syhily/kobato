import { makeContentEntityAdapter } from '@kobato/server/domains/content/entities/lifecycle-adapter.ts'
import { pageDescriptor } from '@kobato/server/domains/pages/descriptor.ts'

// `pages/descriptor.ts` is the single declaration driving both the revision pipeline and the meta CRUD.
export const pageLifecycleAdapter = makeContentEntityAdapter(pageDescriptor)
