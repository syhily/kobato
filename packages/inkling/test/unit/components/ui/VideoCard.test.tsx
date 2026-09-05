import { fireEvent, render, screen } from '@testing-library/react'
import { createEditor } from 'lexical'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDragHandler, createUploader } from '#/utils/mock-file-factories'
import { VideoCard } from '@/components/ui/cards/VideoCard'

vi.mock('../../../../src/components/ui/CardCaptionEditor', () => ({
  CardCaptionEditor: () => <div data-testid="card-caption-editor" />,
}))

function createCaptionEditor() {
  return createEditor({ namespace: 'test', onError: () => {} })
}

describe('VideoCard', () => {
  const fileInputRef = React.createRef<HTMLInputElement>()

  const defaultProps: React.ComponentProps<typeof VideoCard> = {
    captionEditor: createCaptionEditor(),
    captionEditorInitialState: undefined,
    fileInputRef,
    onVideoFileChange: vi.fn(),
    videoDragHandler: createDragHandler(),
    videoUploader: createUploader({ progress: 0 }),
    videoUploadErrors: [],
    videoMimeTypes: ['video/mp4'],
    customThumbnail: '',
    thumbnail: '',
    onCustomThumbnailChange: vi.fn(),
    customThumbnailUploader: createUploader({ progress: 0 }),
    onRemoveCustomThumbnail: vi.fn(),
    totalDuration: '1:23',
    cardWidth: 'regular',
    isLoopChecked: false,
    onLoopChange: vi.fn(),
    onCardWidthChange: vi.fn(),
    thumbnailMimeTypes: ['image/png'],
    thumbnailDragHandler: createDragHandler(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders empty video card', () => {
    render(<VideoCard {...defaultProps} />)

    expect(screen.getByTestId('media-placeholder')).toBeInTheDocument()
    expect(document.querySelector('input[type="file"]')).toBeInTheDocument()
  })

  it('renders populated video card with thumbnail', () => {
    render(
      <VideoCard {...defaultProps} thumbnail="https://example.com/thumb.jpg" customThumbnail="" isEditing={false} />,
    )

    expect(screen.getByTestId('video-card-populated')).toBeInTheDocument()
    expect(screen.getByAltText('Video thumbnail')).toHaveAttribute('src', 'https://example.com/thumb.jpg')
  })

  it('renders populated video card with custom thumbnail overlay', () => {
    render(
      <VideoCard
        {...defaultProps}
        thumbnail="https://example.com/thumb.jpg"
        customThumbnail="https://example.com/custom.jpg"
        isEditing={false}
      />,
    )

    expect(screen.getByAltText('Video custom thumbnail')).toHaveAttribute('src', 'https://example.com/custom.jpg')
  })

  it('renders progress bar when video is loading', () => {
    render(<VideoCard {...defaultProps} videoUploader={createUploader({ isLoading: true, progress: 42 })} />)

    expect(screen.getByTestId('video-progress')).toBeInTheDocument()
  })

  it('renders settings panel when editing and populated', () => {
    render(<VideoCard {...defaultProps} thumbnail="https://example.com/thumb.jpg" isEditing={true} />)

    expect(screen.getByTestId('settings-panel')).toBeInTheDocument()
    expect(screen.getByTestId('loop-video')).toBeInTheDocument()
  })

  it('triggers width change via button group', () => {
    render(<VideoCard {...defaultProps} thumbnail="https://example.com/thumb.jpg" isEditing={true} />)

    const wideButton = screen.getByLabelText('Wide')
    fireEvent.click(wideButton)
    expect(defaultProps.onCardWidthChange).toHaveBeenCalledWith('wide')
  })

  it('triggers loop toggle', () => {
    render(<VideoCard {...defaultProps} thumbnail="https://example.com/thumb.jpg" isEditing={true} />)

    const toggle = screen.getByTestId('loop-video')
    fireEvent.click(toggle)
    expect(defaultProps.onLoopChange).toHaveBeenCalled()
  })

  it('fires file change on video input', () => {
    render(<VideoCard {...defaultProps} />)

    const file = new File(['video'], 'test.mp4', { type: 'video/mp4' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    expect(defaultProps.onVideoFileChange).toHaveBeenCalled()
  })
})
