import type { Meta, StoryObj } from '@storybook/react'

import { PlusButton } from '@/components/ui/PlusMenu'

const meta = {
  title: 'Card menu/Plus button',
  component: PlusButton,
  parameters: {
    status: {
      type: 'functional',
    },
  },
} satisfies Meta<typeof PlusButton>
export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div className="relative mt-[2px] ml-[66px]">
      <PlusButton {...args} />
    </div>
  ),
}
