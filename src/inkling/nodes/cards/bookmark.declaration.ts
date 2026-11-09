import {
  BaseBookmarkNode,
  bookmarkNestedEditors,
  bookmarkTransientProps,
} from '@/inkling/nodes/base/nodes/bookmark/BookmarkNode'
import { checkedCardDeclaration, type CardDeclaration } from '@/inkling/nodes/cards/card-declaration'

export const bookmarkDeclaration = checkedCardDeclaration({
  nodeType: 'bookmark',
  baseNode: BaseBookmarkNode,
  nestedEditors: bookmarkNestedEditors,
  transientProps: bookmarkTransientProps,
  menu: [
    {
      label: 'Bookmark',
      labelKey: 'bookmark',
      desc: 'Embed a link as a visual bookmark',
      icon: 'bookmark',
      command: 'insert',
      matches: ['bookmark'],
      queryParams: ['url'],
      priority: 4,
      shortcut: '/bookmark [url]',
    },
  ],
  insert: { requiresRangeSelection: true, insertCommandPriority: 'high' },
  toolbarLabel: 'bookmark',
  markdown: { kind: 'fence' },
} satisfies CardDeclaration<
  'bookmark',
  typeof BaseBookmarkNode,
  typeof bookmarkTransientProps,
  typeof bookmarkNestedEditors
>)
