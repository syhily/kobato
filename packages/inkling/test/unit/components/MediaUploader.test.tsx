import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { MediaUploader } from '@/components/ui/MediaUploader'

describe('MediaUploader', function () {
  const file = new File(['hello'], 'test.png', { type: 'image/png' })

  it('renders the placeholder when no src is provided and not loading', function () {
    render(<MediaUploader desc="Upload an image" icon="image" onFileChange={() => {}} />)

    expect(screen.getByTestId('media-upload-placeholder')).toBeInTheDocument()
    expect(screen.getByText('Upload an image')).toBeInTheDocument()
  })

  it('renders the filled media state when src is provided', function () {
    render(<MediaUploader alt="kitten" src="https://example.com/kitten.png" onFileChange={() => {}} />)

    expect(screen.getByTestId('media-upload-filled')).toBeInTheDocument()
    expect(screen.getByAltText('kitten')).toHaveAttribute('src', 'https://example.com/kitten.png')
  })

  it('shows the progress bar while loading', function () {
    render(<MediaUploader isLoading progress={42} src="https://example.com/kitten.png" onFileChange={() => {}} />)

    expect(screen.getByTestId('custom-thumbnail-progress')).toBeInTheDocument()
  })

  it('calls onFileChange when a file is selected', function () {
    const onFileChange = vi.fn()
    const { container } = render(<MediaUploader icon="image" onFileChange={onFileChange} />)

    const input = container.querySelector('input[name="image-input"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    expect(onFileChange).toHaveBeenCalledTimes(1)
    expect(onFileChange.mock.calls[0]![0]).toEqual([file])
  })

  it('calls onRemoveMedia when the delete button is clicked', function () {
    const onRemoveMedia = vi.fn()
    render(<MediaUploader src="https://example.com/kitten.png" onFileChange={() => {}} onRemoveMedia={onRemoveMedia} />)

    fireEvent.click(screen.getByLabelText('Delete'))

    expect(onRemoveMedia).toHaveBeenCalledTimes(1)
  })

  it('opens the image editor with the current image and converts the saved blob into a File', function () {
    const onFileChange = vi.fn()
    const openImageEditor = vi.fn(({ handleSave }: { image: string; handleSave: (blob: Blob) => void }) => {
      handleSave(file)
    })

    render(
      <MediaUploader
        isPinturaEnabled
        openImageEditor={openImageEditor}
        src="https://example.com/kitten.png"
        onFileChange={onFileChange}
      />,
    )

    fireEvent.click(screen.getByLabelText('Edit'))

    expect(openImageEditor).toHaveBeenCalledTimes(1)
    expect(openImageEditor).toHaveBeenCalledWith(expect.objectContaining({ image: 'https://example.com/kitten.png' }))
    expect(onFileChange).toHaveBeenCalledTimes(1)
    expect(onFileChange.mock.calls[0]![0]).toEqual([file])
  })

  it('passes the file input ref to setFileInputRef', function () {
    const setFileInputRef = vi.fn()
    const { container } = render(
      <MediaUploader icon="image" setFileInputRef={setFileInputRef} onFileChange={() => {}} />,
    )

    // Trigger a render of the ref callback by mounting the hidden input
    const input = container.querySelector('input[name="image-input"]') as HTMLInputElement
    expect(input).toBeInTheDocument()
    expect(setFileInputRef).toHaveBeenCalled()
    expect(setFileInputRef.mock.calls[0]![0]).toHaveProperty('current')
  })
})
