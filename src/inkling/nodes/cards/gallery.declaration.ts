import type { CardDeclaration } from '@/inkling/nodes/cards/card-declaration'

import {
  BaseGalleryNode,
  galleryNestedEditors,
  galleryTransientProps,
} from '@/inkling/nodes/base/nodes/gallery/GalleryNode'

export const galleryDeclaration = {
  nodeType: 'gallery',
  baseNode: BaseGalleryNode,
  nestedEditors: galleryNestedEditors,
  transientProps: galleryTransientProps,
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
