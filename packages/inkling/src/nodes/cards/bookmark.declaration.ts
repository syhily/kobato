import type { NestedEditorSpec, TransientPropSpec } from '@/nodes/base/card-specs'

import { BaseBookmarkNode } from '@/nodes/base/nodes/bookmark/BookmarkNode'

import type { CardDeclaration } from './card-declaration'

import { captionEditorSpec } from './caption-editor-spec'

// `as const` keeps the literal `name`s and value types on the declaration's
// type — the `__*` field map derives both from them (CardSpecFieldMap)
export const nestedEditors = [captionEditorSpec()] as const satisfies readonly NestedEditorSpec[]

export const transientProps = [
  // true only for a card constructed from a bare url before its metadata was
  // fetched — the component's metadata-fetch effect keys off it. The initial
  // value reads the dataset the base constructor forwards to the generated
  // constructor.
  { name: 'createdWithUrl', initial: (dataset): boolean => !!dataset.url && !dataset.metadata },
] as const satisfies readonly TransientPropSpec[]

export const bookmarkDeclaration = {
  nodeType: 'bookmark',
  baseNode: BaseBookmarkNode,
  nestedEditors,
  transientProps,
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
} satisfies CardDeclaration<'bookmark'>
