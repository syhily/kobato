import type { Meta, StoryObj } from '@storybook/react'

import { useState } from 'react'

import { Modal } from '@/components/ui/Modal'

const meta = {
  title: 'Generic/Modal',
  component: Modal,
  parameters: {
    status: {
      type: 'functional',
    },
  },
} satisfies Meta<typeof Modal>
export default meta

type Story = StoryObj<typeof meta>

function ModalStory() {
  const [isOpen, setOpen] = useState(false)

  const openModal = () => setOpen(true)
  const closeModal = () => setOpen(false)

  return (
    <div className="relative mt-[2px] ml-[66px]">
      <button type="button" onClick={openModal}>
        Open modal
      </button>

      <Modal isOpen={isOpen} onClose={closeModal}>
        <div className="p-8">
          <h1>Headline</h1>
          Some content
        </div>
      </Modal>
    </div>
  )
}

export const Default: Story = {
  args: {
    isOpen: false,
    onClose: () => {},
  },
  render: () => <ModalStory />,
}
