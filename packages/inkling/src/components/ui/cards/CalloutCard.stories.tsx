import type { Meta, StoryObj } from '@storybook/react'

import { createEditor } from 'lexical'
import React from 'react'

import { CalloutCard } from '@/components/ui/cards/CalloutCard'
import { CardWrapper } from '@/components/ui/CardWrapper'
import { CARD_DISPLAY_OPTIONS, cardDisplayArgType, type CardDisplayKey } from '@/utils/storybook/card-display'
import populateEditor from '@/utils/storybook/populate-storybook-editor'

type CalloutCardProps = React.ComponentProps<typeof CalloutCard>

interface CalloutCardStoryArgs extends Partial<CalloutCardProps> {
  display?: CardDisplayKey
  value?: string
  placeholder?: string
}

function CalloutCardStory({ display = 'Default', value = '', placeholder, ...args }: CalloutCardStoryArgs) {
  const textEditor = createEditor()
  populateEditor({ editor: textEditor, initialHtml: value })
  const displayState = CARD_DISPLAY_OPTIONS[display]

  return (
    <div className="inkling-prose">
      <div className="mx-auto my-8 max-w-[740px] min-w-[initial]">
        <CardWrapper {...displayState} {...args}>
          <CalloutCard
            {...displayState}
            {...args}
            changeEmoji={() => {}}
            textEditor={textEditor}
            toggleEmoji={() => {}}
          />
        </CardWrapper>
      </div>
    </div>
  )
}

const meta = {
  title: 'Primary cards/Callout card',
  component: CalloutCardStory,
  subcomponents: { CardWrapper },
  argTypes: {
    display: cardDisplayArgType(),
  },
  parameters: {
    status: {
      type: 'uiReady',
    },
  },
} satisfies Meta<typeof CalloutCardStory>
export default meta

type Story = StoryObj<typeof meta>

export const Empty: Story = {
  args: {
    display: 'Editing',
    value: '',
    placeholder: 'Callout text...',
    hasEmoji: true,
    color: 'grey',
    setShowEmojiPicker: () => {},
  },
}

export const Populated: Story = {
  args: {
    display: 'Editing',
    value: 'Something to pay attention to.',
    placeholder: 'Callout text...',
    hasEmoji: true,
    color: 'grey',
    setShowEmojiPicker: () => {},
  },
}
