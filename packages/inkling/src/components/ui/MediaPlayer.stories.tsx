import type { Meta, StoryObj } from '@storybook/react'

import { MediaPlayer } from '@/components/ui/MediaPlayer'

const meta = {
  title: 'Generic/Media player',
  component: MediaPlayer,
  parameters: {
    status: {
      type: 'functional',
    },
  },
} satisfies Meta<typeof MediaPlayer>
export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    theme: 'dark' as const,
  },
}
