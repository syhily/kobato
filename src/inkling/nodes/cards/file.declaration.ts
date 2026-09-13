import type { CardDeclaration } from '@/inkling/nodes/cards/card-declaration'

import { BaseFileNode, fileTransientProps } from '@/inkling/nodes/base/nodes/file/FileNode'

export const fileDeclaration = {
  nodeType: 'file',
  baseNode: BaseFileNode,
  transientProps: fileTransientProps,
  menu: [
    {
      label: 'File',
      labelKey: 'file',
      desc: 'Upload a downloadable file',
      icon: 'file',
      command: 'insert',
      insertParams: {
        triggerFileDialog: true,
      },
      matches: ['file'],
      priority: 15,
      shortcut: '/file',
    },
  ],
  // presence is the opt-in — no flags
  insert: {},
  uploadType: 'file',
  // diverges from the node type: the toolbar label is a live e2e selector
  // contract ("file-upload"), not a transform of "file"
  toolbarLabel: 'file-upload',
  markdown: { kind: 'fence' },
} satisfies CardDeclaration<'file'>
