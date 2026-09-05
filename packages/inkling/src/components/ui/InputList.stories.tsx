import type { Meta, StoryObj } from '@storybook/react'

import { InputList, InputListItem } from '@/components/ui/InputList'

const meta = {
  title: 'Generic/InputList',
  component: InputList,
  parameters: {
    status: {
      type: 'uiReady',
    },
  },
} satisfies Meta<typeof InputList>
export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    listOptions: [
      { value: 'https://google.com', label: 'Google' },
      { value: 'https://facebook.com', label: 'Facebook' },
      { value: 'https://twitter.com', label: 'Twitter' },
      { value: 'https://instagram.com', label: 'Instagram' },
      { value: 'https://youtube.com', label: 'Youtube' },
      { value: 'https://linkedin.com', label: 'Linkedin' },
      { value: 'https://pinterest.com', label: 'Pinterest' },
      { value: 'https://tiktok.com', label: 'TikTok' },
      { value: 'https://twitch.com', label: 'Twitch' },
      { value: 'https://reddit.com', label: 'Reddit' },
      { value: 'https://github.com', label: 'Github' },
      { value: 'https://stackoverflow.com', label: 'Stackoverflow' },
    ],
    placeholder: 'Enter a URL',
    dataTestId: 'input-list',
    value: '',
    onChange: () => {},
    getItem: (item, selected, onMouseOver, scrollIntoView) => (
      <InputListItem
        key={item.value}
        className="m-0 cursor-pointer px-3 py-[7px] text-left hover:bg-grey-100"
        dataTestId="input-list"
        item={item}
        scrollIntoView={scrollIntoView}
        selected={selected}
        onClick={() => {}}
        onMouseOver={onMouseOver}
      >
        <span className="block text-sm leading-tight font-normal text-black">{item.label}</span>
      </InputListItem>
    ),
  },
  render: (args) => (
    <div className="flex h-screen w-[240px] flex-col justify-between">
      <InputList {...args} />

      <div className="mt-auto">
        <InputList {...args} />
      </div>
    </div>
  ),
}
