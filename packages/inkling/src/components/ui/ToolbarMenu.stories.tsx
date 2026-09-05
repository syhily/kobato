/* oxlint-disable react/jsx-key */
import type { Meta, StoryObj } from '@storybook/react'

import { ToolbarMenu, ToolbarMenuItem, ToolbarMenuSeparator } from '@/components/ui/ToolbarMenu'
import {
  addArgs,
  boldArgs,
  editArgs,
  headingThreeArgs,
  headingTwoArgs,
  imgFullArgs,
  imgRegularArgs,
  imgWideArgs,
  italicArgs,
  linkArgs,
  quoteArgs,
  snippetArgs,
} from '@/components/ui/ToolbarMenuItem.stories'

const meta = {
  title: 'Toolbar/Toolbar',
  component: ToolbarMenu,
  subcomponents: { ToolbarMenuSeparator },
  parameters: {
    status: {
      type: 'functional',
    },
  },
} satisfies Meta<typeof ToolbarMenu>
export default meta

type Story = StoryObj<typeof meta>

export const Text: Story = {
  args: {
    children: [
      <ToolbarMenuItem {...boldArgs} />,
      <ToolbarMenuItem {...italicArgs} />,
      <ToolbarMenuItem {...headingTwoArgs} />,
      <ToolbarMenuItem {...headingThreeArgs} />,
      <ToolbarMenuSeparator />,
      <ToolbarMenuItem {...quoteArgs} />,
      <ToolbarMenuItem {...linkArgs} />,
      <ToolbarMenuSeparator />,
      <ToolbarMenuItem {...snippetArgs} />,
    ],
  },
}

export const Image: Story = {
  args: {
    children: [
      <ToolbarMenuItem {...imgRegularArgs} />,
      <ToolbarMenuItem {...imgWideArgs} />,
      <ToolbarMenuItem {...imgFullArgs} />,
      <ToolbarMenuSeparator />,
      <ToolbarMenuItem {...linkArgs} />,
      <ToolbarMenuSeparator />,
      <ToolbarMenuItem {...snippetArgs} />,
    ],
  },
}

export const Gallery: Story = {
  args: {
    children: [<ToolbarMenuItem {...addArgs} />, <ToolbarMenuSeparator />, <ToolbarMenuItem {...snippetArgs} />],
  },
}

export const EditableCards: Story = {
  args: {
    children: [<ToolbarMenuItem {...editArgs} />, <ToolbarMenuSeparator />, <ToolbarMenuItem {...snippetArgs} />],
  },
}

export const NonEditableCards: Story = {
  args: {
    children: [<ToolbarMenuItem {...snippetArgs} />],
  },
}
