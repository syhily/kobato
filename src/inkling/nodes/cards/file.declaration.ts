import type { TransientPropSpec } from '@/inkling/nodes/base/card-specs'
import type { CardDeclaration } from '@/inkling/nodes/cards/card-declaration'

import { transientInitialFileProp, transientTriggerFileDialogProp } from '@/inkling/nodes/base/card-specs'
import { BaseFileNode } from '@/inkling/nodes/base/nodes/file/FileNode'

// `as const` keeps the literal `name`s and `initial` value types on the
// declaration's type — the `__*` field map derives both from them
// (CardSpecFieldMap)
export const transientProps = [
  transientTriggerFileDialogProp,
  transientInitialFileProp,
] as const satisfies readonly TransientPropSpec[]

export const fileDeclaration = {
  nodeType: 'file',
  baseNode: BaseFileNode,
  transientProps,
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
