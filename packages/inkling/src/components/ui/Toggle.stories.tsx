import type { Meta, StoryObj } from '@storybook/react'

import { Toggle } from '@/components/ui/Toggle'

const meta = {
  title: 'Generic/Toggle',
  component: Toggle,
  parameters: {
    status: {
      type: 'functional',
    },
  },
} satisfies Meta<typeof Toggle>
export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    isChecked: true,
  },
}
