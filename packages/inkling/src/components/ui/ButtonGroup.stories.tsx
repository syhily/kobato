import type { Meta, StoryObj } from '@storybook/react'

import ImgFullIcon from '@/assets/icons/inkling-img-full.svg?react'
import ImgRegularIcon from '@/assets/icons/inkling-img-regular.svg?react'
import ImgWideIcon from '@/assets/icons/inkling-img-wide.svg?react'
import { ButtonGroup, ButtonGroupIconButton } from '@/components/ui/ButtonGroup'

const meta = {
  title: 'Generic/Button group (beta)',
  component: ButtonGroup,
  subcomponents: { ButtonGroupIconButton },
  parameters: {
    status: {
      type: 'functional',
    },
  },
  argTypes: {
    selectedName: { control: 'select', options: ['regular', 'wide', 'full'] },
  },
} satisfies Meta<typeof ButtonGroup>
export default meta

type Story = StoryObj<typeof meta>

export const CardWidth: Story = {
  args: {
    selectedName: 'regular',
    buttons: [
      {
        label: 'Regular',
        name: 'regular',
        Icon: ImgRegularIcon,
      },
      {
        label: 'Wide',
        name: 'wide',
        Icon: ImgWideIcon,
      },
      {
        label: 'Full',
        name: 'full',
        Icon: ImgFullIcon,
      },
    ],
  },
}
