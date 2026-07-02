import { createCommand } from 'lexical'

import AudioCardIcon from '@/ui/inkling-editor/assets/icons/inkling-card-type-audio.svg?react'
import InklingCardWrapper from '@/ui/inkling-editor/components/InklingCardWrapper'
import { AudioNodeComponent } from '@/ui/inkling-editor/nodes/AudioNodeComponent'
import { AudioNode as BaseAudioNode } from '@/ui/inkling-editor/nodes/base'

export const INSERT_AUDIO_COMMAND = createCommand()

export class AudioNode extends BaseAudioNode {
  __triggerFileDialog = false
  __initialFile: File | undefined = undefined

  static kgMenu = [
    {
      label: 'Audio',
      desc: 'Upload and play an audio file',
      Icon: AudioCardIcon,
      insertCommand: INSERT_AUDIO_COMMAND,
      insertParams: {
        triggerFileDialog: true,
      },
      matches: ['audio'],
      priority: 14,
      shortcut: '/audio',
    },
  ]

  static uploadType = 'audio'

  // oxlint-disable-next-line typescript/no-explicit-any
  constructor(dataset: Record<string, any> = {}, key?: string) {
    super(dataset, key)

    const { triggerFileDialog, initialFile } = dataset

    // don't trigger the file dialog when rendering if we've already been given a url
    this.__triggerFileDialog = (!dataset.src && triggerFileDialog) || false
    this.__initialFile = initialFile || null
  }

  getIcon() {
    return AudioCardIcon
  }

  set triggerFileDialog(shouldTrigger: boolean) {
    const writable = this.getWritable()
    writable.__triggerFileDialog = shouldTrigger
  }

  decorate() {
    return (
      <InklingCardWrapper nodeKey={this.getKey()}>
        <AudioNodeComponent
          duration={this.duration}
          initialFile={this.__initialFile}
          nodeKey={this.getKey()}
          src={this.src}
          thumbnailSrc={this.thumbnailSrc}
          title={this.title}
          triggerFileDialog={this.__triggerFileDialog}
        />
      </InklingCardWrapper>
    )
  }
}

// oxlint-disable-next-line typescript/no-explicit-any
export const $createAudioNode = (dataset: Record<string, any>) => {
  return new AudioNode(dataset)
}

export function $isAudioNode(node: unknown) {
  return node instanceof AudioNode
}
