import type { Meta, StoryObj } from '@storybook/react'

import React from 'react'

import { SnippetInput } from '@/components/ui/SnippetInput'

const meta = {
  title: 'Toolbar/SnippetInput',
  component: SnippetInput,
  parameters: {
    status: {
      type: 'Functional',
    },
  },
} satisfies Meta<typeof SnippetInput>
export default meta

type Story = StoryObj<typeof meta>

function SnippetInputStory(args: React.ComponentProps<typeof SnippetInput>) {
  const [value, setValue] = React.useState(args.value || '')

  return (
    <div className="flex">
      <SnippetInput
        {...args}
        value={value ?? ''}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
      />
    </div>
  )
}

export const Empty: Story = {
  args: {
    value: '',
  },
  render: (args) => <SnippetInputStory {...args} />,
}

export const Populated: Story = {
  args: {
    value: 'snippet',
  },
  render: (args) => <SnippetInputStory {...args} />,
}

export const WithList: Story = {
  args: {
    value: 'snippet',
    snippets: [
      {
        name: 'snippet1',
        value: 'text for snippet 1',
      },
      {
        name: 'snippet2',
        value: 'text for snippet 2',
      },
      {
        name: 'snippet3',
        value: 'text for snippet 3',
      },
    ],
  },
  render: (args) => <SnippetInputStory {...args} />,
}
