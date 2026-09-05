import type { NestedEditorSpec, TransientPropSpec } from '@/nodes/base/card-specs'

import { transientInitialFileProp, transientTriggerFileDialogProp } from '@/nodes/base/card-specs'
import { BaseVideoNode } from '@/nodes/base/nodes/video/VideoNode'
import { decorateCardWidth } from '@/nodes/base/utils/card-widths'

import type { CardDeclaration } from './card-declaration'

import { captionEditorSpec } from './caption-editor-spec'

// `as const` keeps the literal `name`s and value types on the declaration's
// type — the `__*` field map derives both from them (CardSpecFieldMap). The
// nested editor rides captionEditorSpec's nullable carrier: the markdown
// round-trip detaches it
export const nestedEditors = [captionEditorSpec({ nullable: true })] as const satisfies readonly NestedEditorSpec[]

export const transientProps = [
  transientTriggerFileDialogProp,
  transientInitialFileProp,
] as const satisfies readonly TransientPropSpec[]

export const videoDeclaration = {
  nodeType: 'video',
  baseNode: BaseVideoNode,
  nestedEditors,
  transientProps,
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
} satisfies CardDeclaration<'video'>
