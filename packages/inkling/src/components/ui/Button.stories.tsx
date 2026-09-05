import type { Meta, StoryObj } from '@storybook/react'

import { Button } from '@/components/ui/Button'

const meta = {
  title: 'Generic/Button',
  component: Button,
  argTypes: {
    color: {
      options: ['white', 'grey', 'black', 'accent'],
      control: { type: 'select' },
    },
    size: {
      options: ['small', 'medium', 'large'],
      control: { type: 'select' },
    },
    width: {
      options: ['auto', 'full'],
      control: { type: 'radio' },
    },
  },
  parameters: {
    status: {
      type: 'uiReady',
    },
  },
} satisfies Meta<typeof Button>
export default meta

type Story = StoryObj<typeof meta>

export const Empty: Story = {
  args: {
    color: 'accent',
    size: 'small',
    width: 'auto',
    value: '',
    placeholder: 'Add button text',
  },
}

export const Populated: Story = {
  args: {
    color: 'accent',
    size: 'small',
    width: 'auto',
    value: 'Subscribe',
    placeholder: 'Add button text',
    href: 'https://google.com/',
    target: '__blank',
  },
}
