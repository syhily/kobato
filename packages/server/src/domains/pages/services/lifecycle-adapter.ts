import { makeContentEntityAdapter } from '@kobato/server/domains/content/entities/lifecycle-adapter.ts'
import { pageDescriptor } from '@kobato/server/domains/pages/descriptor.ts'

export const pageLifecycleAdapter = makeContentEntityAdapter(pageDescriptor)
