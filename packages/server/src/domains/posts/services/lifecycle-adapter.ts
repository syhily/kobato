import { makeContentEntityAdapter } from '@kobato/server/domains/content/entities/lifecycle-adapter.ts'
import { postDescriptor } from '@kobato/server/domains/posts/descriptor.ts'

export const postLifecycleAdapter = makeContentEntityAdapter(postDescriptor)
