import type { Meta, StoryObj } from '@storybook/react'

import DeleteIcon from '@/assets/icons/inkling-trash.svg?react'
import { IconButton } from '@/components/ui/IconButton'

const meta = {
  title: 'Generic/Icon button',
  component: IconButton,
  parameters: {
    status: {
      type: 'functional',
    },
  },
} satisfies Meta<typeof IconButton>
export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    Icon: DeleteIcon,
  },
}
