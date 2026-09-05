import type { TransientPropSpec } from '@/nodes/base/card-specs'

import { transientInitialFileProp, transientTriggerFileDialogProp } from '@/nodes/base/card-specs'
import { BaseAudioNode } from '@/nodes/base/nodes/audio/AudioNode'

import type { CardDeclaration } from './card-declaration'

// `as const` keeps the literal `name`s and `initial` value types on the
// declaration's type — the `__*` field map derives both from them
// (CardSpecFieldMap)
export const transientProps = [
  transientTriggerFileDialogProp,
  transientInitialFileProp,
] as const satisfies readonly TransientPropSpec[]

export const audioDeclaration = {
  nodeType: 'audio',
  baseNode: BaseAudioNode,
  transientProps,
  menu: [
    {
      label: 'Audio',
      labelKey: 'audio',
      desc: 'Upload and play an audio file',
      icon: 'audio',
      command: 'insert',
      insertParams: {
        triggerFileDialog: true,
      },
      matches: ['audio'],
      priority: 14,
      shortcut: '/audio',
    },
  ],
  insert: { claimsMediaInsert: true },
  uploadType: 'audio',
  toolbarLabel: 'audio',
  markdown: { kind: 'fence' },
} satisfies CardDeclaration<'audio'>
