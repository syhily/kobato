import type { CardDeclaration } from '@/inkling/nodes/cards/card-declaration'

import { BaseImageNode, imageNestedEditors, imageTransientProps } from '@/inkling/nodes/base/nodes/image/ImageNode'
import { decorateCardWidth } from '@/inkling/nodes/base/utils/card-widths'

export const imageDeclaration = {
  nodeType: 'image',
  baseNode: BaseImageNode,
  nestedEditors: imageNestedEditors,
  transientProps: imageTransientProps,
  decorateTarget: {
    width: decorateCardWidth,
  },
  menu: [
    {
      label: 'Image',
      labelKey: 'image',
      desc: 'Upload, or embed with /image [url]',
      icon: 'image',
      command: 'insert',
      insertParams: {
        triggerFileDialog: true,
      },
      matches: ['image', 'img'],
      queryParams: ['src'],
      priority: 1,
      shortcut: '/image',
    },
    {
      label: 'GIF',
      labelKey: 'gif',
      desc: 'Search and embed gifs',
      icon: 'gif',
      command: 'openGifSelector',
      insertParams: {
        triggerFileDialog: false,
      },
      matches: ['gif', 'giphy', 'tenor', 'klipy'],
      priority: 17,
      queryParams: ['src'],
      isHidden: ({ config }) => !config?.tenor && !config?.klipy,
      shortcut: '/gif',
    },
    {
      label: 'Image library',
      labelKey: 'imageLibrary',
      desc: 'Pick from your media library',
      icon: 'image',
      command: 'openImageLibrary',
      insertParams: {
        triggerFileDialog: false,
      },
      matches: ['library', 'media'],
      priority: 18,
      isHidden: ({ config }) => !config?.imageLibrary,
      shortcut: '/library',
    },
  ],
  insert: { claimsMediaInsert: true },
  uploadType: 'image',
  toolbarLabel: 'image',
  // Markdown-eligible with no card fence: image speaks standard `![alt](src)`
  // syntax via the hand-written IMAGE_CARD_TRANSFORMER
  // (`@/inkling/nodes/cards/card-markdown-transformers`).
  markdown: { kind: 'exempt' },
} satisfies CardDeclaration<'image'>
