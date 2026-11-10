import type { BookmarkNodeDataset } from '@/inkling/nodes/cards/card-commands'

import { assembleCardNodeOnce } from '@/inkling/nodes/assemble-card-node'
import { bookmarkDeclaration } from '@/inkling/nodes/cards/bookmark.declaration'
export { $isBookmarkNode } from '@/inkling/nodes/base/nodes/bookmark/BookmarkNode'
export type { SerializedBookmarkNode } from '@/inkling/nodes/base/nodes/bookmark/BookmarkNode'
export { INSERT_BOOKMARK_COMMAND } from '@/inkling/nodes/cards/card-commands'
export type { BookmarkNodeDataset } from '@/inkling/nodes/cards/card-commands'

/**
 * The registered class, assembled once from the card declaration by
 * `assembleCardNodeOnce`; `$isBookmarkNode` is canonical on the base node. The
 * instance type carries the spec-derived `__*` field map, so `$createBookmarkNode`
 * needs no cast.
 */
export const BookmarkNode = assembleCardNodeOnce(bookmarkDeclaration)
export type BookmarkNode = InstanceType<typeof BookmarkNode>

export const $createBookmarkNode = (dataset: BookmarkNodeDataset): BookmarkNode => {
  return new BookmarkNode(dataset)
}
