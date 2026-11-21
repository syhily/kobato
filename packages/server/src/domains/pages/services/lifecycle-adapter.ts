import { makeContentEntityAdapter } from '@kobato/server/domains/content/entities/lifecycle-adapter'
import { pageDescriptor } from '@kobato/server/domains/pages/descriptor'

export const pageLifecycleAdapter = makeContentEntityAdapter(pageDescriptor)
