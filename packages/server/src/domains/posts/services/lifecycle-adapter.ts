import { makeContentEntityAdapter } from '@kobato/server/domains/content/entities/lifecycle-adapter'
import { postDescriptor } from '@kobato/server/domains/posts/descriptor'

export const postLifecycleAdapter = makeContentEntityAdapter(postDescriptor)
