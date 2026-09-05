import type { Meta, StoryObj } from '@storybook/react'

import { ProgressBar } from '@/components/ui/ProgressBar'

const meta = {
  title: 'Generic/Progress bar',
  component: ProgressBar,
  parameters: {
    status: {
      type: 'functional',
    },
  },
} satisfies Meta<typeof ProgressBar>
export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    style: { width: 60 + '%' },
  },
}
