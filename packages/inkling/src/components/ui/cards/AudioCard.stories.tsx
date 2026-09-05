import type { Meta, StoryObj } from '@storybook/react'

import React from 'react'

import { AudioCard, type AudioCardProps } from '@/components/ui/cards/AudioCard'
import { CardWrapper } from '@/components/ui/CardWrapper'
import { CARD_DISPLAY_OPTIONS, cardDisplayArgType, type CardDisplayKey } from '@/utils/storybook/card-display'

interface AudioCardStoryArgs extends Partial<AudioCardProps> {
  display?: CardDisplayKey
  titlePlaceholder?: string
}

function AudioCardStory({ display = 'Default', titlePlaceholder, ...args }: AudioCardStoryArgs) {
  const displayState = CARD_DISPLAY_OPTIONS[display]
  const componentProps = {
    updateTitle: () => {},
    onAudioFileChange: () => {},
    onThumbnailFileChange: () => {},
    audioUploader: { upload: () => Promise.resolve(undefined) },
    thumbnailUploader: { upload: () => Promise.resolve(undefined) },
    ...args,
  }

  return (
    <div className="inkling-prose">
      <div className="not-inkling-prose mx-auto my-8 max-w-[740px] min-w-[initial]">
        <CardWrapper {...displayState} {...componentProps}>
          <AudioCard {...displayState} {...componentProps} />
        </CardWrapper>
      </div>
    </div>
  )
}

const meta = {
  title: 'Primary cards/Audio card',
  component: AudioCardStory,
  subcomponents: { CardWrapper },
  argTypes: {
    display: cardDisplayArgType(),
  },
  parameters: {
    status: {
      type: 'functional',
    },
  },
} satisfies Meta<typeof AudioCardStory>
export default meta

type Story = StoryObj<typeof meta>

export const Empty: Story = {
  args: {
    display: 'Editing',
    src: '',
    duration: 0,
    title: '',
    titlePlaceholder: 'Add a title...',
    audioUploader: { upload: () => Promise.resolve(undefined) },
    thumbnailUploader: { upload: () => Promise.resolve(undefined) },
  },
}

export const Uploading: Story = {
  args: {
    display: 'Editing',
    src: '',
    duration: 0,
    title: '',
    titlePlaceholder: 'Add a title...',
    audioUploader: { progress: 50, isLoading: true, upload: () => Promise.resolve(undefined) },
    thumbnailUploader: { upload: () => Promise.resolve(undefined) },
  },
}

export const DraggedOver: Story = {
  args: {
    display: 'Editing',
    src: '',
    duration: 0,
    title: '',
    audioUploader: { upload: () => Promise.resolve(undefined) },
    thumbnailUploader: { upload: () => Promise.resolve(undefined) },
    audioDragHandler: {
      isDraggedOver: true,
      setRef: () => {},
    },
  },
}

export const Populated: Story = {
  args: {
    display: 'Editing',
    thumbnailSrc: '',
    src: 'audio.mp3',
    duration: 19,
    title: 'The Inkling Podcast',
    titlePlaceholder: 'Add a title...',
    audioUploader: { upload: () => Promise.resolve(undefined) },
    thumbnailUploader: { upload: () => Promise.resolve(undefined) },
  },
}

export const Error: Story = {
  args: {
    display: 'Editing',
    src: '',
    duration: 0,
    title: '',
    titlePlaceholder: 'Add a title...',
    audioUploader: {
      errors: [
        {
          message: 'The file type you uploaded is not supported. Please use .MP3, .WAV, .OGG, .M4A',
        },
      ],
      upload: () => Promise.resolve(undefined),
    },
    thumbnailUploader: { upload: () => Promise.resolve(undefined) },
  },
}

export const ThumbnailUploading: Story = {
  args: {
    display: 'Editing',
    src: 'audio.mp3',
    duration: 19,
    title: 'The Inkling Podcast',
    titlePlaceholder: 'Add a title...',
    thumbnailUploader: { progress: 50, isLoading: true, upload: () => Promise.resolve(undefined) },
  },
}

export const ThumbnailDraggedOver: Story = {
  args: {
    display: 'Editing',
    src: 'audio.mp3',
    duration: 19,
    title: 'The Inkling Podcast',
    titlePlaceholder: 'Add a title...',
    thumbnailDragHandler: {
      isDraggedOver: true,
      setRef: () => {},
    },
    audioUploader: { upload: () => Promise.resolve(undefined) },
    thumbnailUploader: { upload: () => Promise.resolve(undefined) },
  },
}

export const ThumbnailPopulated: Story = {
  args: {
    display: 'Editing',
    thumbnailSrc: 'https://static.inkling.local/Orb4b.gif',
    src: 'audio.mp3',
    duration: 19,
    title: 'The Inkling Podcast',
    titlePlaceholder: 'Add a title...',
    audioUploader: { upload: () => Promise.resolve(undefined) },
    thumbnailUploader: { upload: () => Promise.resolve(undefined) },
  },
}

export const ThumbnailError: Story = {
  args: {
    display: 'Editing',
    src: 'audio.mp3',
    duration: 19,
    title: 'The Inkling Podcast',
    titlePlaceholder: 'Add a title...',
    thumbnailUploader: {
      progress: 100,
      isLoading: false,
      errors: [{ message: 'File not supported' }],
      upload: () => Promise.resolve(undefined),
    },
  },
}
