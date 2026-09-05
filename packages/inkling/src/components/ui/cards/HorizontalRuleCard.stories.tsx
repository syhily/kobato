import type { Meta, StoryObj } from '@storybook/react'

import React from 'react'

import { HorizontalRuleCard } from '@/components/ui/cards/HorizontalRuleCard'
import { CardWrapper } from '@/components/ui/CardWrapper'
import { CARD_DISPLAY_OPTIONS, cardDisplayArgType, type CardDisplayKey } from '@/utils/storybook/card-display'

type HorizontalRuleCardProps = React.ComponentProps<typeof HorizontalRuleCard>

interface HorizontalRuleCardStoryArgs extends Partial<HorizontalRuleCardProps> {
  display?: CardDisplayKey
}

function HorizontalRuleCardStory({ display = 'Default' }: HorizontalRuleCardStoryArgs) {
  const displayState = CARD_DISPLAY_OPTIONS[display]

  return (
    <div className="inkling-prose">
      <div className="mx-auto my-8 max-w-[740px] min-w-[initial]">
        <CardWrapper {...displayState}>
          <HorizontalRuleCard />
        </CardWrapper>
      </div>
    </div>
  )
}

const meta = {
  title: 'Primary cards/Divider card',
  component: HorizontalRuleCardStory,
  subcomponents: { CardWrapper },
  argTypes: {
    display: cardDisplayArgType(['Default', 'Selected']),
  },
  parameters: {
    status: {
      type: 'functional',
    },
  },
} satisfies Meta<typeof HorizontalRuleCardStory>
export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    display: 'Selected',
  },
}
