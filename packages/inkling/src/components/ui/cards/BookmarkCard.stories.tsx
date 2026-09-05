import type { Meta, StoryObj } from '@storybook/react'

import { createEditor } from 'lexical'
import React from 'react'

import { BookmarkCard } from '@/components/ui/cards/BookmarkCard'
import { CardWrapper } from '@/components/ui/CardWrapper'
import { MINIMAL_NODES } from '@/index'
import { CARD_DISPLAY_OPTIONS, cardDisplayArgType, type CardDisplayKey } from '@/utils/storybook/card-display'
import populateEditor from '@/utils/storybook/populate-storybook-editor'

type BookmarkCardProps = React.ComponentProps<typeof BookmarkCard>

interface BookmarkCardStoryArgs extends Partial<BookmarkCardProps> {
  display?: CardDisplayKey
  caption?: string
}

function BookmarkCardStory({ display = 'Default', caption = '', ...args }: BookmarkCardStoryArgs) {
  const captionEditor = createEditor({ nodes: MINIMAL_NODES })
  populateEditor({ editor: captionEditor, initialHtml: caption })
  const displayState = CARD_DISPLAY_OPTIONS[display]
  const componentProps = {
    handleClose: () => {},
    handlePasteAsLink: () => {},
    handleRetry: () => {},
    handleUrlChange: () => {},
    handleUrlSubmit: () => {},
    ...args,
  }

  return (
    <div className="inkling-prose">
      <div className="not-inkling-prose mx-auto my-8 max-w-[740px] min-w-[initial] p-4">
        <CardWrapper {...displayState} {...componentProps}>
          <BookmarkCard {...displayState} {...componentProps} captionEditor={captionEditor} />
        </CardWrapper>
      </div>
      <div className="not-inkling-prose dark mx-auto my-8 max-w-[740px] min-w-[initial] bg-black p-4">
        <CardWrapper {...displayState} {...componentProps}>
          <BookmarkCard {...displayState} {...componentProps} captionEditor={captionEditor} />
        </CardWrapper>
      </div>
    </div>
  )
}

const meta = {
  title: 'Primary cards/Bookmark card',
  component: BookmarkCardStory,
  subcomponents: { CardWrapper },
  argTypes: {
    display: cardDisplayArgType(['Default', 'Selected']),
  },
  parameters: {
    status: {
      type: 'uiReady',
    },
  },
} satisfies Meta<typeof BookmarkCardStory>
export default meta

type Story = StoryObj<typeof meta>

export const Empty: Story = {
  args: {
    display: 'Selected',
    url: '',
    urlPlaceholder: 'Paste URL to add bookmark content...',
    title: 'Inkling: The Creator Economy Platform',
    description:
      'The world’s most popular modern publishing platform for creating a new media platform. Used by Apple, SkyNews, Buffer, OpenAI, and thousands more.',
    icon: 'https://www.inkling.local/favicon.ico',
    publisher: 'Inkling - The Professional Publishing Platform',
    author: 'Author McAuthory',
    thumbnail: 'https://inkling.local/images/meta/inkling.png',
  },
}

export const Populated: Story = {
  args: {
    display: 'Selected',
    url: 'https://inkling.local/',
    urlPlaceholder: 'Paste URL to add bookmark content...',
    title: 'Inkling: The Creator Economy Platform',
    description:
      'The world’s most popular modern publishing platform for creating a new media platform. Used by Apple, SkyNews, Buffer, OpenAI, and thousands more.',
    icon: 'https://www.inkling.local/favicon.ico',
    publisher: 'Inkling - The Professional Publishing Platform',
    author: 'Author McAuthory',
    thumbnail: 'https://inkling.local/images/meta/inkling.png',
    caption: '',
  },
}

export const WithCaption: Story = {
  args: {
    display: 'Selected',
    url: 'https://inkling.local/',
    urlPlaceholder: 'Paste URL to add bookmark content...',
    title: 'Inkling: The Creator Economy Platform',
    description:
      'The world’s most popular modern publishing platform for creating a new media platform. Used by Apple, SkyNews, Buffer, OpenAI, and thousands more.',
    icon: 'https://www.inkling.local/favicon.ico',
    publisher: 'Inkling - The Professional Publishing Platform',
    author: 'Author McAuthory',
    thumbnail: 'https://inkling.local/images/meta/inkling.png',
    caption: 'This is a caption',
  },
}
