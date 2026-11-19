import { BaseFileNode, fileTransientProps } from '@kobato/inkling-internal/nodes/base/nodes/file/FileNode'
import { checkedCardDeclaration, type CardDeclaration } from '@kobato/inkling-internal/nodes/cards/card-declaration'

export const fileDeclaration = checkedCardDeclaration({
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
  insert: {},
  uploadType: 'file',
  toolbarLabel: 'file-upload',
  markdown: { kind: 'fence' },
} satisfies CardDeclaration<'file', typeof BaseFileNode, typeof fileTransientProps, readonly []>)
