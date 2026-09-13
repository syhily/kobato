import type { CardDeclaration } from '@/inkling/nodes/cards/card-declaration'

import { audioTransientProps, BaseAudioNode } from '@/inkling/nodes/base/nodes/audio/AudioNode'

export const audioDeclaration = {
  nodeType: 'audio',
  baseNode: BaseAudioNode,
  transientProps: audioTransientProps,
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
