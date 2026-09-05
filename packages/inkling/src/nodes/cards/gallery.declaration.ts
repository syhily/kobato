import type { NestedEditorSpec, TransientPropSpec } from '@/nodes/base/card-specs'

import { transientTriggerFileDialogProp } from '@/nodes/base/card-specs'
import { BaseGalleryNode } from '@/nodes/base/nodes/gallery/GalleryNode'

import type { CardDeclaration } from './card-declaration'

import { captionEditorSpec } from './caption-editor-spec'

// `as const` keeps the literal `name`s and value types on the declaration's
// type — the `__*` field map derives both from them (CardSpecFieldMap). The
// nested editor rides captionEditorSpec's nullable carrier: the markdown
// round-trip detaches it
export const nestedEditors = [captionEditorSpec({ nullable: true })] as const satisfies readonly NestedEditorSpec[]

// the insert-time "open the file picker" flag — same shared spec entry the
// four upload cards carry, so the menu entry's insertParams lands on the node
export const transientProps = [transientTriggerFileDialogProp] as const satisfies readonly TransientPropSpec[]

export const galleryDeclaration = {
  nodeType: 'gallery',
  baseNode: BaseGalleryNode,
  nestedEditors,
  transientProps,
  decorateTarget: {
    width: 'wide',
  },
  menu: [
    {
      label: 'Gallery',
      labelKey: 'gallery',
      desc: 'Create an image gallery',
      icon: 'gallery',
      command: 'insert',
      insertParams: {
        triggerFileDialog: true,
      },
      matches: ['gallery'],
      priority: 5,
      shortcut: '/gallery',
    },
  ],
  // presence is the opt-in — no flags
  insert: {},
  toolbarLabel: 'gallery',
  markdown: { kind: 'fence' },
} satisfies CardDeclaration<'gallery'>
