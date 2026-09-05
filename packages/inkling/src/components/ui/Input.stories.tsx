import type { Meta, StoryObj } from '@storybook/react'

import { Input } from '@/components/ui/Input'

const meta = {
  title: 'Generic/Input',
  component: Input,
  parameters: {
    status: {
      type: 'uiReady',
    },
  },
} satisfies Meta<typeof Input>
export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div className="w-[240px]">
      <Input {...args} />
    </div>
  ),
}
