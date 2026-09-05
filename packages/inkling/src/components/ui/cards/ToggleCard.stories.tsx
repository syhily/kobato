import type { Meta, StoryObj } from '@storybook/react'

import { createEditor } from 'lexical'
import React from 'react'

import { ToggleCard } from '@/components/ui/cards/ToggleCard'
import { CardWrapper } from '@/components/ui/CardWrapper'
import { BASIC_NODES, MINIMAL_NODES } from '@/index'
import { CARD_DISPLAY_OPTIONS, cardDisplayArgType, type CardDisplayKey } from '@/utils/storybook/card-display'
import populateEditor from '@/utils/storybook/populate-storybook-editor'

type ToggleCardProps = React.ComponentProps<typeof ToggleCard>

interface ToggleCardStoryArgs extends Partial<ToggleCardProps> {
  display?: CardDisplayKey
  heading?: string
  content?: string
}

function ToggleCardStory({ display = 'Default', heading = '', content = '', ...args }: ToggleCardStoryArgs) {
  const headingEditor = createEditor({ nodes: MINIMAL_NODES })
  populateEditor({ editor: headingEditor, initialHtml: heading })

  const contentEditor = createEditor({ nodes: BASIC_NODES })
  populateEditor({ editor: contentEditor, initialHtml: content })

  const displayState = CARD_DISPLAY_OPTIONS[display]
  const componentProps = {
    ...args,
    contentEditor,
    headingEditor,
  }

  return (
    <div className="inkling-prose">
      <div className="not-inkling-prose mx-auto my-8 max-w-[740px] min-w-[initial] py-10">
        <CardWrapper {...displayState}>
          <ToggleCard {...displayState} {...componentProps} />
        </CardWrapper>
      </div>
      <div className="w-full bg-black py-10">
        <div className="not-inkling-prose dark mx-auto my-8 max-w-[740px] min-w-[initial]">
          <CardWrapper {...displayState}>
            <ToggleCard {...displayState} {...componentProps} />
          </CardWrapper>
        </div>
      </div>
    </div>
  )
}

const meta = {
  title: 'Primary cards/Toggle card',
  component: ToggleCardStory,
  subcomponents: { CardWrapper },
  argTypes: {
    display: cardDisplayArgType(),
  },
  parameters: {
    status: {
      type: 'uiReady',
    },
  },
} satisfies Meta<typeof ToggleCardStory>
export default meta

type Story = StoryObj<typeof meta>

export const Empty: Story = {
  args: {
    content: '',
    contentPlaceholder: 'Collapsible content',
    display: 'Editing',
    heading: '',
    headingPlaceholder: 'Toggle header',
  },
}

export const Populated: Story = {
  args: {
    content:
      'Toggles allow you to create collapsible sections of content which is a great way to make your content less overwhelming and easy to navigate. A common example is an FAQ section, like this one.',
    contentPlaceholder: 'Collapsible content',
    display: 'Editing',
    heading: 'When should I use Toggles?',
    headingPlaceholder: 'Toggle header',
  },
}
