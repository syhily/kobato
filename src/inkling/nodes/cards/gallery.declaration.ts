import {
  BaseGalleryNode,
  galleryNestedEditors,
  galleryTransientProps,
} from '@/inkling/nodes/base/nodes/gallery/GalleryNode'
import { checkedCardDeclaration, type CardDeclaration } from '@/inkling/nodes/cards/card-declaration'

export const galleryDeclaration = checkedCardDeclaration({
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
  insert: {},
  toolbarLabel: 'gallery',
  markdown: { kind: 'fence' },
} satisfies CardDeclaration<
  'gallery',
  typeof BaseGalleryNode,
  typeof galleryTransientProps,
  typeof galleryNestedEditors
>)
