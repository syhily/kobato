import type { Meta, StoryObj } from '@storybook/react'

import { LinkInput } from '@/components/ui/LinkInput'

const meta = {
  title: 'Toolbar/LinkInput',
  component: LinkInput,
  parameters: {
    status: {
      type: 'functional',
    },
  },
} satisfies Meta<typeof LinkInput>
export default meta

type Story = StoryObj<typeof meta>

export const Empty: Story = {
  args: {
    href: '',
    update: () => {},
    cancel: () => {},
  },
  render: (args) => (
    <div className="flex">
      <LinkInput {...args} />
    </div>
  ),
}

export const Populated: Story = {
  args: {
    href: 'https://inkling.local',
    update: () => {},
    cancel: () => {},
  },
  render: (args) => (
    <div className="flex">
      <LinkInput {...args} />
    </div>
  ),
}
