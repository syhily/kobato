import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { createDragHandler, createUploader } from '#/utils/mock-file-factories'
import { FileCard } from '@/components/ui/cards/FileCard'

describe('FileCard', function () {
  const file = new File(['pdf'], 'doc.pdf', { type: 'application/pdf' })

  const baseProps = {
    fileDragHandler: createDragHandler(),
    handleFileTitle: () => {},
    handleFileDesc: () => {},
    onFileChange: () => {},
  }

  it('renders the empty upload placeholder when not populated', function () {
    render(<FileCard {...baseProps} />)

    expect(screen.getByText('Click to upload a file')).toBeInTheDocument()
  })

  it('renders populated file metadata', function () {
    render(
      <FileCard
        {...baseProps}
        fileDesc="A description"
        fileName="doc.pdf"
        fileSize="1.2 MB"
        fileTitle="My document"
        isPopulated
      />,
    )

    expect(screen.getByDisplayValue('My document')).toBeInTheDocument()
    expect(screen.getByDisplayValue('A description')).toBeInTheDocument()
    expect(screen.getByText('doc.pdf')).toBeInTheDocument()
    expect(screen.getByText((content) => content.includes('1.2 MB'))).toBeInTheDocument()
  })

  it('calls handleFileTitle when the title input changes', function () {
    const handleFileTitle = vi.fn()
    render(<FileCard {...baseProps} fileTitle="Old" handleFileTitle={handleFileTitle} isPopulated />)

    fireEvent.change(screen.getByDisplayValue('Old'), { target: { value: 'New' } })

    expect(handleFileTitle).toHaveBeenCalledTimes(1)
  })

  it('calls handleFileDesc when the description input changes', function () {
    const handleFileDesc = vi.fn()
    render(<FileCard {...baseProps} fileDesc="Old" handleFileDesc={handleFileDesc} isPopulated />)

    fireEvent.change(screen.getByDisplayValue('Old'), { target: { value: 'New' } })

    expect(handleFileDesc).toHaveBeenCalledTimes(1)
  })

  it('calls onFileChange when a file is selected', function () {
    const onFileChange = vi.fn()
    const { container } = render(<FileCard {...baseProps} onFileChange={onFileChange} />)

    const input = container.querySelector('input[name="file-input"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    expect(onFileChange).toHaveBeenCalledTimes(1)
    expect(onFileChange.mock.calls[0]![0]).toEqual([file])
  })

  it('shows the uploading state', function () {
    render(<FileCard {...baseProps} fileUploader={createUploader({ isLoading: true, progress: 50 })} />)

    expect(screen.queryByText('Click to upload a file')).not.toBeInTheDocument()
    expect(document.querySelector('[class*="bg-grey-50"]')).toBeInTheDocument()
  })
})
