/* oxlint-disable react/jsx-key */
import type { Meta, StoryObj } from '@storybook/react'

import React from 'react'

import { ToolbarMenuItem } from '@/components/ui/ToolbarMenu'

const meta = {
  title: 'Toolbar/Toolbar buttons',
  component: ToolbarMenuItem,
  parameters: {
    status: {
      type: 'functional',
    },
  },
} satisfies Meta<typeof ToolbarMenuItem>
export default meta

type Story = StoryObj<typeof meta>

function ToolbarMenuItemStory(args: React.ComponentProps<typeof ToolbarMenuItem>) {
  const [isActive, setActive] = React.useState(false)

  return (
    <div className="flex">
      <div className="rounded bg-black">
        <ToolbarMenuItem {...args} isActive={isActive} onClick={() => setActive(!isActive)} />
      </div>
    </div>
  )
}

export const boldArgs = { icon: 'bold' as const, label: 'Bold', isActive: false as const }
export const Bold: Story = {
  args: boldArgs,
  render: (args) => <ToolbarMenuItemStory {...args} />,
}

export const italicArgs = { icon: 'italic' as const, label: 'Italic', isActive: false as const }
export const Italic: Story = {
  args: italicArgs,
  render: (args) => <ToolbarMenuItemStory {...args} />,
}

export const headingTwoArgs = { icon: 'headingTwo' as const, label: 'Heading 2', isActive: false as const }
export const HeadingTwo: Story = {
  args: headingTwoArgs,
  render: (args) => <ToolbarMenuItemStory {...args} />,
}

export const headingThreeArgs = { icon: 'headingThree' as const, label: 'Heading 3', isActive: false as const }
export const HeadingThree: Story = {
  args: headingThreeArgs,
  render: (args) => <ToolbarMenuItemStory {...args} />,
}

export const quoteArgs = { icon: 'quote' as const, label: 'Quote', isActive: false as const }
export const Quote: Story = {
  args: quoteArgs,
  render: (args) => <ToolbarMenuItemStory {...args} />,
}

export const quoteOneArgs = { icon: 'quoteOne' as const, label: 'Quote 1', isActive: false as const }
export const QuoteOne: Story = {
  args: quoteOneArgs,
  render: (args) => <ToolbarMenuItemStory {...args} />,
}

export const quoteTwoArgs = { icon: 'quoteTwo' as const, label: 'Quote 2', isActive: false as const }
export const QuoteTwo: Story = {
  args: quoteTwoArgs,
  render: (args) => <ToolbarMenuItemStory {...args} />,
}

export const linkArgs = { icon: 'link' as const, label: 'Link', isActive: false as const }
export const Link: Story = {
  args: linkArgs,
  render: (args) => <ToolbarMenuItemStory {...args} />,
}

export const imgRegularArgs = { icon: 'imgRegular' as const, label: 'Regular image', isActive: false as const }
export const ImgRegular: Story = {
  args: imgRegularArgs,
  render: (args) => <ToolbarMenuItemStory {...args} />,
}

export const imgWideArgs = { icon: 'imgWide' as const, label: 'Wide image', isActive: false as const }
export const ImgWide: Story = {
  args: imgWideArgs,
  render: (args) => <ToolbarMenuItemStory {...args} />,
}

export const imgFullArgs = { icon: 'imgFull' as const, label: 'Full image', isActive: false as const }
export const ImgFull: Story = {
  args: imgFullArgs,
  render: (args) => <ToolbarMenuItemStory {...args} />,
}

export const addArgs = { icon: 'add' as const, label: 'Add', isActive: false as const }
export const Add: Story = {
  args: addArgs,
  render: (args) => <ToolbarMenuItemStory {...args} />,
}

export const editArgs = { icon: 'edit' as const, label: 'Edit', isActive: false as const }
export const Edit: Story = {
  args: editArgs,
  render: (args) => <ToolbarMenuItemStory {...args} />,
}

export const snippetArgs = { icon: 'snippet' as const, label: 'Snippet', isActive: false as const }
export const Snippet: Story = {
  args: snippetArgs,
  render: (args) => <ToolbarMenuItemStory {...args} />,
}
