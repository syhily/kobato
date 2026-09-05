import type { Meta, StoryObj } from '@storybook/react'

import { createEditor } from 'lexical'
import React from 'react'

import { VideoCard, type VideoCardProps } from '@/components/ui/cards/VideoCard'
import { CardWrapper } from '@/components/ui/CardWrapper'
import { MINIMAL_NODES } from '@/index'
import { normalizeCardWidth } from '@/nodes/base/utils/card-widths'
import { CARD_DISPLAY_OPTIONS, cardDisplayArgType, type CardDisplayKey } from '@/utils/storybook/card-display'
import populateEditor from '@/utils/storybook/populate-storybook-editor'

interface VideoCardStoryArgs extends Partial<VideoCardProps> {
  display?: CardDisplayKey
  caption?: string
}

function VideoCardStory({ display = 'Default', caption = '', ...args }: VideoCardStoryArgs) {
  const captionEditor = createEditor({ nodes: MINIMAL_NODES })
  populateEditor({ editor: captionEditor, initialHtml: caption })
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const displayState = CARD_DISPLAY_OPTIONS[display]
  const componentProps = {
    captionEditorInitialState: undefined,
    fileInputRef,
    onVideoFileChange: () => {},
    videoDragHandler: { isDraggedOver: false, setRef: () => {} },
    videoMimeTypes: [],
    customThumbnail: '',
    thumbnail: '',
    onCustomThumbnailChange: () => {},
    onRemoveCustomThumbnail: () => {},
    totalDuration: '',
    cardWidth: 'regular',
    isLoopChecked: false,
    onLoopChange: () => {},
    onCardWidthChange: () => {},
    thumbnailMimeTypes: [],
    ...args,
    captionEditor,
  }

  // computed from the raw args (not componentProps — it carries refs, and
  // passing a ref-bearing object member into a function reads it during render)
  const normalizedCardWidth = normalizeCardWidth(args.cardWidth ?? 'regular')

  return (
    <div className="inkling-prose">
      <div className="not-inkling-prose mx-auto my-8 max-w-[740px] min-w-[initial]">
        <CardWrapper {...displayState} {...componentProps} cardWidth={normalizedCardWidth}>
          <VideoCard {...displayState} {...componentProps} />
        </CardWrapper>
      </div>
    </div>
  )
}

const meta = {
  title: 'Primary cards/Video card',
  component: VideoCardStory,
  subcomponents: { CardWrapper },
  argTypes: {
    display: cardDisplayArgType(),
    cardWidth: {
      options: ['regular', 'wide', 'full'],
      control: { type: 'radio' },
    },
  },
  parameters: {
    status: {
      type: 'functional',
    },
  },
} satisfies Meta<typeof VideoCardStory>
export default meta

type Story = StoryObj<typeof meta>

export const Empty: Story = {
  args: {
    display: 'Editing',
    caption: '',
  },
}

export const Uploading: Story = {
  args: {
    display: 'Editing',
    cardWidth: 'regular',
    thumbnail: 'https://static.inkling.local/v5.0.0/images/publication-cover.jpg',
    customThumbnail: '',
    totalDuration: '32:27',
    caption: '',
    videoUploader: {
      isLoading: true,
      progress: 60,
      upload: () => Promise.resolve(undefined),
    },
  },
}

export const DraggedOver: Story = {
  args: {
    display: 'Editing',
    cardWidth: 'regular',
    thumbnail: '',
    customThumbnail: '',
    caption: '',
    videoDragHandler: {
      isDraggedOver: true,
      setRef: () => {},
    },
  },
}

export const Populated: Story = {
  args: {
    display: 'Editing',
    cardWidth: 'regular',
    isLoopChecked: false,
    thumbnail: 'https://static.inkling.local/v5.0.0/images/publication-cover.jpg',
    customThumbnail: '',
    totalDuration: '32:27',
    caption: 'Watch the full documentary here.',
  },
}

export const Error: Story = {
  args: {
    display: 'Editing',
    cardWidth: 'regular',
    thumbnail: '',
    customThumbnail: '',
    totalDuration: '32:27',
    caption: '',
    videoUploadErrors: [{ message: 'The file type you uploaded is not supported. Please use .MP4, .WEBM, .OGV' }],
  },
}

export const ThumbnailUploading: Story = {
  args: {
    display: 'Editing',
    cardWidth: 'regular',
    thumbnail: 'https://static.inkling.local/v5.0.0/images/publication-cover.jpg',
    customThumbnail: '',
    totalDuration: '32:27',
    caption: 'Watch the full documentary here.',
    customThumbnailUploader: {
      isLoading: true,
      progress: 60,
      upload: () => Promise.resolve(undefined),
    },
  },
}

export const ThumbnailDraggedOver: Story = {
  args: {
    display: 'Editing',
    cardWidth: 'regular',
    thumbnail: 'https://static.inkling.local/v5.0.0/images/publication-cover.jpg',
    customThumbnail: '',
    totalDuration: '32:27',
    caption: 'Watch the full documentary here.',
    thumbnailDragHandler: {
      isDraggedOver: true,
      setRef: () => {},
    },
  },
}

export const ThumbnailPopulated: Story = {
  args: {
    display: 'Editing',
    cardWidth: 'regular',
    isLoopChecked: false,
    thumbnail: 'https://static.inkling.local/v5.0.0/images/publication-cover.jpg',
    customThumbnail: 'https://static.inkling.local/v5.0.0/images/publication-cover.jpg',
    totalDuration: '32:27',
    caption: 'Watch the full documentary here.',
  },
}

export const ThumbnailError: Story = {
  args: {
    display: 'Editing',
    cardWidth: 'regular',
    isLoopChecked: false,
    thumbnail: 'https://static.inkling.local/v5.0.0/images/publication-cover.jpg',
    customThumbnail: '',
    totalDuration: '32:27',
    caption: 'Watch the full documentary here.',
    customThumbnailUploader: {
      errors: [{ message: 'This file type is not supported. Please use .GIF, .JPG, .JPEG, .PNG, .SVG, .SVGZ, .WEBP' }],
      upload: () => Promise.resolve(undefined),
    },
  },
}
