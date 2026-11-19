import type { ListingPostCardWithMetadata } from '@kobato/catalog/model.ts'
import type { MetaDescriptor } from 'react-router'

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

export interface PublicListingLoaderData<TExtra = undefined> extends ListingPageLoaderData<TExtra> {
  eid: string | null
}

export interface ListingExtraArgs<TPost = ListingPostCardWithMetadata> {
  resolvedPosts: TPost[]
  pageNum: number
  totalPage: number
}
