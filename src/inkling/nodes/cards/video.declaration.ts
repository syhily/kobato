import { BaseVideoNode, videoNestedEditors, videoTransientProps } from '@/inkling/nodes/base/nodes/video/VideoNode'
import { decorateCardWidth } from '@/inkling/nodes/base/utils/card-widths'
import { checkedCardDeclaration, type CardDeclaration } from '@/inkling/nodes/cards/card-declaration'

export const videoDeclaration = checkedCardDeclaration({
  nodeType: 'video',
  baseNode: BaseVideoNode,
  nestedEditors: videoNestedEditors,
  transientProps: videoTransientProps,
  decorateTarget: {
    width: decorateCardWidth,
  },
  menu: [
    {
      label: 'Video',
      labelKey: 'video',
      desc: 'Upload and play a video file',
      icon: 'video',
      command: 'insert',
      insertParams: {
        triggerFileDialog: true,
      },
      matches: ['video'],
      priority: 13,
      shortcut: '/video',
    },
  ],
  insert: { claimsMediaInsert: true },
  uploadType: 'video',
  toolbarLabel: 'video',
  markdown: { kind: 'fence' },
} satisfies CardDeclaration<'video', typeof BaseVideoNode, typeof videoTransientProps, typeof videoNestedEditors>)
