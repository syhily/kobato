import type { NestedEditorSpec, TransientPropSpec } from '@/inkling/nodes/base/card-specs'
import type { CardDeclaration } from '@/inkling/nodes/cards/card-declaration'

import { transientInitialFileProp, transientTriggerFileDialogProp } from '@/inkling/nodes/base/card-specs'
import { BaseVideoNode } from '@/inkling/nodes/base/nodes/video/VideoNode'
import { decorateCardWidth } from '@/inkling/nodes/base/utils/card-widths'
import { captionEditorSpec } from '@/inkling/nodes/cards/caption-editor-spec'

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
