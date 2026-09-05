import type { Meta, StoryObj } from '@storybook/react'

import { SubscribeForm } from '@/components/ui/SubscribeForm'

const meta = {
  title: 'Generic/Subscribe form',
  component: SubscribeForm,
  parameters: {
    status: {
      type: 'uiReady',
    },
  },
} satisfies Meta<typeof SubscribeForm>
export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div className="w-[560px]">
      <SubscribeForm {...args} />
    </div>
  ),
}
