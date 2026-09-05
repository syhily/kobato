import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { createDragHandler, createUploader } from '#/utils/mock-file-factories'
import { ImageCard } from '@/components/ui/cards/ImageCard'

vi.mock('../../../src/components/ui/CardCaptionEditor', () => ({
  CardCaptionEditor: () => <div data-testid="card-caption-editor" />,
}))

describe('ImageCard', function () {
  const file = new File(['image'], 'photo.png', { type: 'image/png' })

  const baseProps = {
    captionEditor: null,
    imageUploader: createUploader(),
    setAltText: () => {},
    onFileChange: () => {},
  }

  it('renders the empty upload placeholder when no src is provided', function () {
    render(<ImageCard {...baseProps} />)

    expect(screen.getByText('Click to select an image')).toBeInTheDocument()
  })

  it('renders the populated image when src is provided', function () {
    render(<ImageCard {...baseProps} altText="A cat" src="https://example.com/cat.png" />)

    expect(screen.getByTestId('image-card-populated')).toBeInTheDocument()
    expect(screen.getByAltText('A cat')).toHaveAttribute('src', 'https://example.com/cat.png')
  })

  it('shows the loading overlay while uploading', function () {
    render(
      <ImageCard
        {...baseProps}
        imageUploader={createUploader({ isLoading: true, progress: 33 })}
        src="https://example.com/cat.png"
      />,
    )

    expect(screen.getByTestId('image-card-loading')).toBeInTheDocument()
    expect(screen.getByTestId('upload-progress')).toBeInTheDocument()
  })

  it('announces upload progress in the alt text while uploading', function () {
    render(
      <ImageCard
        {...baseProps}
        imageUploader={createUploader({ isLoading: true, progress: 50 })}
        src="https://example.com/cat.png"
      />,
    )

    expect(screen.getByTestId('image-card-loading')).toHaveAttribute('alt', 'upload in progress, 50')
  })

  it('does not announce upload progress once the upload completes', function () {
    render(
      <ImageCard
        {...baseProps}
        imageUploader={createUploader({ isLoading: false, progress: 100 })}
        src="https://example.com/cat.png"
      />,
    )

    expect(screen.getByTestId('image-card-populated')).toHaveAttribute('alt', '')
  })

  it('shows the drag-to-replace overlay when the file drag handler is active', function () {
    render(
      <ImageCard
        {...baseProps}
        imageFileDragHandler={createDragHandler({ isDraggedOver: true })}
        src="https://example.com/cat.png"
      />,
    )

    expect(screen.getByTestId('drag-overlay')).toHaveTextContent('Drop to replace image')
  })

  it('calls onFileChange when a new image file is selected', function () {
    const onFileChange = vi.fn()
    const { container } = render(<ImageCard {...baseProps} onFileChange={onFileChange} />)

    const input = container.querySelector('input[name="image-input"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    expect(onFileChange).toHaveBeenCalledTimes(1)
    expect(onFileChange.mock.calls[0]![0]).toEqual([file])
  })

  it('calls onFileChange via the Pintura image editor save handler', function () {
    const onFileChange = vi.fn()
    const editedBlob = new Blob(['edited'], { type: 'image/png' })
    const openImageEditor = vi.fn(
      ({ handleSave }: Parameters<NonNullable<React.ComponentProps<typeof ImageCard>['openImageEditor']>>[0]) => {
        handleSave(editedBlob)
      },
    )

    render(
      <ImageCard
        {...baseProps}
        isPinturaEnabled
        openImageEditor={openImageEditor}
        src="https://example.com/cat.png"
        onFileChange={onFileChange}
      />,
    )

    fireEvent.click(screen.getByLabelText('Edit'))

    expect(openImageEditor).toHaveBeenCalledTimes(1)
    expect(onFileChange).toHaveBeenCalledTimes(1)
  })
})
