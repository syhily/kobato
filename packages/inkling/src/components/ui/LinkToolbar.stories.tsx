import type { Meta, StoryObj } from '@storybook/react'

import { LinkToolbar } from '@/components/ui/LinkToolbar'

const meta = {
  title: 'Toolbar/LinkToolbar',
  component: LinkToolbar,
  parameters: {
    status: {
      type: 'functional',
    },
  },
} satisfies Meta<typeof LinkToolbar>
export default meta

type Story = StoryObj<typeof meta>

export const Base: Story = {
  args: {
    href: 'https://inkling.local/',
  },
  render: (args) => (
    <div className="flex">
      <LinkToolbar {...args} />
    </div>
  ),
}
