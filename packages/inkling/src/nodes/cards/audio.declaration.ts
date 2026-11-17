import { audioTransientProps, BaseAudioNode } from '../base/nodes/audio/AudioNode'
import { checkedCardDeclaration, type CardDeclaration } from './card-declaration'

export const audioDeclaration = checkedCardDeclaration({
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
} satisfies CardDeclaration<'audio', typeof BaseAudioNode, typeof audioTransientProps, readonly []>)
