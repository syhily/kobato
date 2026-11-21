import { bumpCounter, clear } from '@kobato/server/infra/cache/registry'

export type ContentInvalidationEvent =
  | { entity: 'post' }
  | { entity: 'page' }
  | { entity: 'category' }
  | { entity: 'tag' }

export function invalidateContent(event: ContentInvalidationEvent): void {
  switch (event.entity) {
    case 'post':
      clear('feed')
      clear('sitemap')
      bumpCounter('searchResult')
      return
    case 'page':
      clear('sitemap')
      return
    case 'category':
      clear('feed')
      return
    case 'tag':
      clear('feed')
  }
}
