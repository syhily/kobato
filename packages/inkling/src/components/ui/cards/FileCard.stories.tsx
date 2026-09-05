import type { Meta, StoryObj } from '@storybook/react'

import React from 'react'

import { FileCard, type FileCardProps } from '@/components/ui/cards/FileCard'
import { CardWrapper } from '@/components/ui/CardWrapper'
import { CARD_DISPLAY_OPTIONS, cardDisplayArgType, type CardDisplayKey } from '@/utils/storybook/card-display'

interface FileCardStoryArgs extends Partial<FileCardProps> {
  display?: CardDisplayKey
}

function FileCardStory({ display = 'Default', ...args }: FileCardStoryArgs) {
  const displayState = CARD_DISPLAY_OPTIONS[display]
  const componentProps = {
    fileDragHandler: { isDraggedOver: false, setRef: () => {} },
    onFileChange: () => {},
    handleFileTitle: () => {},
    handleFileDesc: () => {},
    ...args,
  }

  return (
    <div className="inkling-prose">
      <div className="not-inkling-prose mx-auto my-8 max-w-[740px] min-w-[initial]">
        <CardWrapper {...displayState} {...componentProps}>
          <FileCard {...displayState} {...componentProps} />
        </CardWrapper>
      </div>
      <div className="dark bg-black py-10">
        <div className="not-inkling-prose mx-auto my-8 max-w-[740px] min-w-[initial]">
          <CardWrapper {...displayState} {...componentProps}>
            <FileCard {...displayState} {...componentProps} />
          </CardWrapper>
        </div>
      </div>
    </div>
  )
}

const meta = {
  title: 'Primary cards/File card',
  component: FileCardStory,
  subcomponents: { CardWrapper },
  argTypes: {
    display: cardDisplayArgType(),
  },
  parameters: {
    status: {
      type: 'uiReady',
    },
  },
} satisfies Meta<typeof FileCardStory>
export default meta

type Story = StoryObj<typeof meta>

export const Empty: Story = {
  args: {
    display: 'Editing',
    isPopulated: false,
    fileTitle: 'Example file',
    fileTitlePlaceholder: 'File title',
    fileDesc: '',
    fileDescPlaceholder: 'Add optional file description',
    fileName: 'Example-file.pdf',
    fileSize: '165 KB',
    fileInputRef: { current: null },
  },
}

export const Populated: Story = {
  args: {
    display: 'Editing',
    isPopulated: true,
    fileTitle: 'Example file',
    fileTitlePlaceholder: 'File title',
    fileDesc: '',
    fileDescPlaceholder: 'Add optional file description',
    fileName: 'Example-file.pdf',
    fileSize: '165 KB',
    fileInputRef: { current: null },
  },
}
