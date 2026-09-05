import type { Meta, StoryObj } from '@storybook/react'

import { MediaPlaceholder } from '@/components/ui/MediaPlaceholder'

const meta = {
  title: 'Generic/Media placeholder (beta)',
  component: MediaPlaceholder,
  argTypes: {
    icon: {
      options: ['image', 'gallery', 'video', 'audio', 'file', 'product'],
      control: { type: 'select' },
    },
    size: {
      options: ['xsmall', 'small', 'medium', 'large'],
      control: { type: 'select' },
    },
    borderStyle: {
      options: ['squared', 'rounded'],
      control: { type: 'radio' },
    },
  },
  parameters: {
    status: {
      type: 'functional',
    },
  },
} satisfies Meta<typeof MediaPlaceholder>
export default meta

type Story = StoryObj<typeof meta>

const baseArgs = {
  filePicker: () => {},
}

export const Image: Story = {
  args: {
    ...baseArgs,
    icon: 'image' as const,
    desc: 'Click to select an image',
    size: 'medium' as const,
    borderStyle: 'squared' as const,
  },
}

export const Gallery: Story = {
  args: {
    ...baseArgs,
    icon: 'gallery' as const,
    desc: 'Click to select up to 9 images',
    size: 'large' as const,
    borderStyle: 'squared' as const,
  },
}

export const Video: Story = {
  args: {
    ...baseArgs,
    icon: 'video' as const,
    desc: 'Click to select a video',
    size: 'medium' as const,
    borderStyle: 'squared' as const,
  },
}

export const Audio: Story = {
  args: {
    ...baseArgs,
    icon: 'audio' as const,
    desc: 'Click to upload an audio file',
    size: 'xsmall' as const,
    borderStyle: 'squared' as const,
  },
}

export const File: Story = {
  args: {
    ...baseArgs,
    icon: 'file' as const,
    desc: 'Click to upload a file',
    size: 'xsmall' as const,
    borderStyle: 'squared' as const,
  },
}

export const Product: Story = {
  args: {
    ...baseArgs,
    icon: 'product' as const,
    desc: 'Click to upload a product image',
    size: 'small' as const,
    borderStyle: 'squared' as const,
  },
}

export const ErrorState: Story = {
  args: {
    ...baseArgs,
    icon: 'video' as const,
    desc: 'Click to select a video',
    size: 'medium' as const,
    borderStyle: 'squared' as const,
    errors: [{ message: 'The file type you uploaded is not supported. Please use .MP4, .WEBM, .OGV' }],
  },
}
