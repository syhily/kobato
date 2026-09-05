import type { BookmarkNodeDataset } from '@/nodes/cards/card-commands'

import { assembleCardNodeOnce } from '@/nodes/assemble-card-node'
import { bookmarkDeclaration } from '@/nodes/cards/bookmark.declaration'
export { $isBookmarkNode } from '@/nodes/base/nodes/bookmark/BookmarkNode'
export type { SerializedBookmarkNode } from '@/nodes/base/nodes/bookmark/BookmarkNode'
export { INSERT_BOOKMARK_COMMAND } from '@/nodes/cards/card-commands'
export type { BookmarkNodeDataset } from '@/nodes/cards/card-commands'

/**
 * The registered class is assembled once from the card declaration, and
 * `$isBookmarkNode` is canonical on the base node. The instance type
 * carries the spec-derived `__*` field map (names and value types from the
 * declaration's spec via CardSpecFieldMap), so `$createBookmarkNode`
 * constructs the assembled class — which initializes the nested-editor and
 * transient-prop specs — with no cast.
 */
export const BookmarkNode = assembleCardNodeOnce(bookmarkDeclaration)
export type BookmarkNode = InstanceType<typeof BookmarkNode>

export const $createBookmarkNode = (dataset: BookmarkNodeDataset): BookmarkNode => {
  // the nested-editor and transient fields are initialized by the constructor from the dataset
  return new BookmarkNode(dataset)
}
