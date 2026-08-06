import type { MetaDescriptor } from 'react-router'

import type { ListingPostCardWithMetadata } from '@/shared/types/catalog'

// Shared loader-return shape for every listing route (`/`, `/cats/:slug`,
// `/tags/:slug`, `/search/:keyword`). Components destructure the same fields
// regardless of which loader produced the data. `extra` is a per-route slot
// for sidebar/feature data that doesn't fit the generic listing contract.
//
// Lives in `shared/` so the `content.*` oRPC contracts
// (`@/shared/contracts/content`) can type their listing output against it —
// the server implementation (`@/server/http/loaders/listing`) and the route
// modules both import it from here.
export interface ListingPageLoaderData<TExtra = undefined> {
  pageNum: number
  totalPage: number
  rootPath: string
  resolvedPosts: ListingPostCardWithMetadata[]
  title?: string
  description?: string
  /** Pre-computed `MetaDescriptor[]` ready to return from `meta()`. */
  seo: MetaDescriptor[]
  extra: TExtra
  /** ISO instant captured once per loader run; thread into `formatShowDate` so SSR matches hydration. */
  listingNowIso: string
}

export interface ListingExtraArgs<TPost = ListingPostCardWithMetadata> {
  resolvedPosts: TPost[]
  pageNum: number
  totalPage: number
}
