import type { Meta, StoryObj } from '@storybook/react'

import { createEditor } from 'lexical'
import React from 'react'

import { CodeBlockCard } from '@/components/ui/cards/CodeBlockCard'
import { CardWrapper } from '@/components/ui/CardWrapper'
import { MINIMAL_NODES } from '@/index'
import { CARD_DISPLAY_OPTIONS, cardDisplayArgType, type CardDisplayKey } from '@/utils/storybook/card-display'
import populateEditor from '@/utils/storybook/populate-storybook-editor'

type CodeBlockCardProps = React.ComponentProps<typeof CodeBlockCard>

interface CodeBlockCardStoryArgs extends Partial<CodeBlockCardProps> {
  display?: CardDisplayKey
  caption?: string
}

function CodeBlockCardStory({ display = 'Default', caption = '', ...args }: CodeBlockCardStoryArgs) {
  const captionEditor = createEditor({ nodes: MINIMAL_NODES })
  populateEditor({ editor: captionEditor, initialHtml: caption })
  const displayState = CARD_DISPLAY_OPTIONS[display]

  return (
    <div className="inkling-prose">
      <div className="mx-auto my-8 max-w-[740px] min-w-[initial]">
        <CardWrapper wrapperStyle="code-card" {...displayState} {...args}>
          <CodeBlockCard captionEditor={captionEditor} updateCode={() => {}} {...displayState} {...args} />
        </CardWrapper>
      </div>
    </div>
  )
}

const meta = {
  title: 'Primary cards/Code card',
  component: CodeBlockCardStory,
  subcomponents: { CardWrapper },
  argTypes: {
    display: cardDisplayArgType(),
  },
  parameters: {
    status: {
      type: 'functional',
    },
  },
} satisfies Meta<typeof CodeBlockCardStory>
export default meta

type Story = StoryObj<typeof meta>

export const Empty: Story = {
  args: {
    display: 'Editing',
    code: '',
    language: '',
    caption: '',
  },
}

export const Populated: Story = {
  args: {
    display: 'Editing',
    code: '<script></script>',
    language: 'html',
    caption: 'A code example',
  },
}
