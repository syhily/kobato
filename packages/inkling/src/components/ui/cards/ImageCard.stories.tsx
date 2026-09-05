import type { Meta, StoryObj } from '@storybook/react'

import { createEditor } from 'lexical'
import React from 'react'

import { ImageCard, type ImageCardProps } from '@/components/ui/cards/ImageCard'
import { CardWrapper } from '@/components/ui/CardWrapper'
import { MINIMAL_NODES } from '@/index'
import { normalizeCardWidth } from '@/nodes/base/utils/card-widths'
import { CARD_DISPLAY_OPTIONS, cardDisplayArgType, type CardDisplayKey } from '@/utils/storybook/card-display'
import populateEditor from '@/utils/storybook/populate-storybook-editor'

interface ImageCardStoryArgs extends Partial<ImageCardProps> {
  display?: CardDisplayKey
  caption?: string
}

function ImageCardStory({ display = 'Default', caption = '', ...args }: ImageCardStoryArgs) {
  const captionEditor = createEditor({ nodes: MINIMAL_NODES })
  populateEditor({ editor: captionEditor, initialHtml: caption })
  const displayState = CARD_DISPLAY_OPTIONS[display]
  const componentProps = {
    onFileChange: () => {},
    setAltText: () => {},
    imageUploader: { upload: () => Promise.resolve(undefined) },
    ...args,
  }

  return (
    <div className="inkling-prose">
      <div className="mx-auto my-8 max-w-[740px] min-w-[initial]">
        <CardWrapper {...displayState} {...componentProps} cardWidth={normalizeCardWidth(componentProps.cardWidth)}>
          <ImageCard {...displayState} {...componentProps} captionEditor={captionEditor} />
        </CardWrapper>
      </div>
    </div>
  )
}

const meta = {
  title: 'Primary cards/Image card',
  component: ImageCardStory,
  subcomponents: { CardWrapper },
  argTypes: {
    display: cardDisplayArgType(['Default', 'Selected']),
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
} satisfies Meta<typeof ImageCardStory>
export default meta

type Story = StoryObj<typeof meta>

export const Empty: Story = {
  args: {
    display: 'Selected',
    setAltText: () => {},
    caption: '',
    altText: '',
    imageUploader: {
      isLoading: false,
      progress: 100,
      upload: () => Promise.resolve(undefined),
    },
    imageFileDragHandler: {
      isDraggedOver: false,
      setRef: () => {},
    },
  },
}

export const Uploading: Story = {
  args: {
    display: 'Selected',
    cardWidth: 'regular',
    setAltText: () => {},
    caption: '',
    altText: '',
    previewSrc: 'https://static.inkling.local/v4.0.0/images/feature-image.jpg',
    imageUploader: {
      progress: 50,
      isLoading: true,
      upload: () => Promise.resolve(undefined),
    },
    imageFileDragHandler: {
      isDraggedOver: false,
      setRef: () => {},
    },
  },
}

export const Populated: Story = {
  args: {
    display: 'Selected',
    cardWidth: 'regular',
    src: 'https://static.inkling.local/v4.0.0/images/feature-image.jpg',
    setAltText: () => {},
    caption: 'Welcome to your new Inkling publication',
    altText: 'Feature image',
    imageUploader: {
      isLoading: false,
      progress: 100,
      upload: () => Promise.resolve(undefined),
    },
    imageFileDragHandler: {
      isDraggedOver: false,
      setRef: () => {},
    },
  },
}

export const Errors: Story = {
  args: {
    display: 'Selected',
    cardWidth: 'regular',
    setAltText: () => {},
    caption: '',
    altText: '',
    imageUploader: {
      errors: [
        {
          message:
            'The file type you uploaded is not supported. Please use .GIF, .JPG, .JPEG, .PNG, .SVG, .SVGZ, .WEBP',
        },
      ],
      upload: () => Promise.resolve(undefined),
    },
    imageFileDragHandler: {
      isDraggedOver: false,
      setRef: () => {},
    },
  },
}

export const DraggedOver: Story = {
  args: {
    display: 'Selected',
    cardWidth: 'regular',
    setAltText: () => {},
    caption: '',
    altText: '',
    imageUploader: {
      errors: [
        {
          message:
            'The file type you uploaded is not supported. Please use .GIF, .JPG, .JPEG, .PNG, .SVG, .SVGZ, .WEBP',
        },
      ],
      upload: () => Promise.resolve(undefined),
    },
    imageFileDragHandler: {
      isDraggedOver: true,
      setRef: () => {},
    },
  },
}
