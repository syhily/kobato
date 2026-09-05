import type { Meta, StoryObj } from '@storybook/react'

import { UrlInput } from '@/components/ui/UrlInput'

const meta = {
  title: 'Generic/URL Input',
  component: UrlInput,
  parameters: {
    status: {
      type: 'uiReady',
    },
  },
} satisfies Meta<typeof UrlInput>
export default meta

type Story = StoryObj<typeof meta>

const baseArgs = {
  handleUrlChange: () => {},
}

export const Empty: Story = {
  args: {
    ...baseArgs,
    value: '',
  },
  render: (args) => (
    <div className="w-[740px]">
      <div className="p-4">
        <UrlInput {...args} />
      </div>
      <div className="dark bg-black p-4">
        <UrlInput {...args} />
      </div>
    </div>
  ),
}

export const Loading: Story = {
  args: {
    ...baseArgs,
    value: 'https://inkling.local/',
    isLoading: true,
  },
  render: (args) => (
    <div className="w-[740px]">
      <div className="p-4">
        <UrlInput {...args} />
      </div>
      <div className="dark bg-black p-4">
        <UrlInput {...args} />
      </div>
    </div>
  ),
}

export const Placeholder: Story = {
  args: {
    ...baseArgs,
    value: '',
    placeholder: 'Enter a URL to add content...',
  },
  render: (args) => (
    <div className="w-[740px]">
      <div className="p-4">
        <UrlInput {...args} />
      </div>
      <div className="dark bg-black p-4">
        <UrlInput {...args} />
      </div>
    </div>
  ),
}

export const Populated: Story = {
  args: {
    ...baseArgs,
    value: 'https://sampleurl.com',
  },
  render: (args) => (
    <div className="w-[740px]">
      <div className="p-4">
        <UrlInput {...args} />
      </div>
      <div className="dark bg-black p-4">
        <UrlInput {...args} />
      </div>
    </div>
  ),
}

export const Error: Story = {
  args: {
    ...baseArgs,
    value: 'thisisntaurl',
    hasError: true,
    handleRetry: () => {},
    handlePasteAsLink: () => {},
  },
  render: (args) => (
    <div className="w-[740px]">
      <div className="p-4">
        <UrlInput {...args} />
      </div>
      <div className="dark bg-black p-4">
        <UrlInput {...args} />
      </div>
    </div>
  ),
}
