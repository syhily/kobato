import type { Meta, StoryObj } from '@storybook/react'

import React from 'react'

import { ButtonCard } from '@/components/ui/cards/ButtonCard'
import { CardWrapper } from '@/components/ui/CardWrapper'
import { CARD_DISPLAY_OPTIONS, cardDisplayArgType, type CardDisplayKey } from '@/utils/storybook/card-display'

type ButtonCardProps = React.ComponentProps<typeof ButtonCard>

interface ButtonCardStoryArgs extends Partial<ButtonCardProps> {
  display?: CardDisplayKey
}

function ButtonCardStory({ display = 'Default', ...args }: ButtonCardStoryArgs) {
  const displayState = CARD_DISPLAY_OPTIONS[display]

  return (
    <div className="inkling-prose">
      <div className="mx-auto my-8 max-w-[740px] min-w-[initial]">
        <CardWrapper wrapperStyle="wide" {...displayState} {...args}>
          <ButtonCard {...displayState} {...args} />
        </CardWrapper>
      </div>
    </div>
  )
}

const meta = {
  title: 'Primary cards/Button card',
  component: ButtonCardStory,
  subcomponents: { CardWrapper },
  argTypes: {
    display: cardDisplayArgType(),
    alignment: {
      options: ['left', 'center'],
      control: { type: 'radio' },
    },
  },
  parameters: {
    status: {
      type: 'uiReady',
    },
  },
} satisfies Meta<typeof ButtonCardStory>
export default meta

type Story = StoryObj<typeof meta>

export const Empty: Story = {
  args: {
    display: 'Editing',
    alignment: 'center',
    buttonText: '',
    buttonPlaceholder: 'Add button text',
    buttonUrl: '',
  },
}

export const Populated: Story = {
  args: {
    display: 'Editing',
    alignment: 'center',
    buttonText: 'Subscribe',
    buttonPlaceholder: 'Add button text',
    buttonUrl: 'https://inkling.local/',
  },
}
