import type { Meta, StoryObj } from '@storybook/react'

import { ColorPicker } from '@/components/ui/ColorPicker'

const meta = {
  title: 'Generic/Color picker (New)',
  component: ColorPicker,
  parameters: {
    status: {
      type: 'uiReady',
    },
  },
} satisfies Meta<typeof ColorPicker>
export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    value: '#777777',
    onChange: () => {},
  },
}

export const WithEyedropper: Story = {
  args: {
    value: '#777777',
    eyedropper: true,
    onChange: () => {},
  },
}

export const WithTransparentOption: Story = {
  args: {
    value: '#777777',
    hasTransparentOption: true,
    onChange: () => {},
  },
}
