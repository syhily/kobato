import type { BookmarkNodeDataset } from '@kobato/inkling-internal/nodes/cards/card-commands'

import { assembleCardNodeOnce } from '@kobato/inkling-internal/nodes/assemble-card-node'
import { bookmarkDeclaration } from '@kobato/inkling-internal/nodes/cards/bookmark.declaration'
export { $isBookmarkNode } from '@kobato/inkling-internal/nodes/base/nodes/bookmark/BookmarkNode'
export type { SerializedBookmarkNode } from '@kobato/inkling-internal/nodes/base/nodes/bookmark/BookmarkNode'
export { INSERT_BOOKMARK_COMMAND } from '@kobato/inkling-internal/nodes/cards/card-commands'
export type { BookmarkNodeDataset } from '@kobato/inkling-internal/nodes/cards/card-commands'

export const BookmarkNode = assembleCardNodeOnce(bookmarkDeclaration)
export type BookmarkNode = InstanceType<typeof BookmarkNode>
export const $createBookmarkNode = (dataset: BookmarkNodeDataset): BookmarkNode => {
  return new BookmarkNode(dataset)
}
