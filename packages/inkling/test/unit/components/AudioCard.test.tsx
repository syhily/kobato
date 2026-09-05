import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { createUploader } from '#/utils/mock-file-factories'
import { AudioCard } from '@/components/ui/cards/AudioCard'

describe('AudioCard', function () {
  const file = new File(['audio'], 'track.mp3', { type: 'audio/mpeg' })

  const emptyProps = {
    audioUploader: createUploader(),
    thumbnailUploader: createUploader(),
    updateTitle: () => {},
    onAudioFileChange: () => {},
    onThumbnailFileChange: () => {},
  }

  it('renders the empty upload placeholder when no src is provided', function () {
    render(<AudioCard {...emptyProps} />)

    expect(screen.getByText('Click to upload an audio file')).toBeInTheDocument()
  })

  it('renders the populated card with a title and formatted duration', function () {
    render(<AudioCard {...emptyProps} duration={125} src="https://example.com/track.mp3" title="My track" />)

    expect(screen.getByTestId('audio-card-populated')).toBeInTheDocument()
    expect(screen.getByDisplayValue('My track')).toBeInTheDocument()
    expect(screen.getByText('2:05')).toBeInTheDocument()
  })

  it('calls updateTitle when the title input changes', function () {
    const updateTitle = vi.fn()
    render(<AudioCard {...emptyProps} src="https://example.com/track.mp3" title="Old" updateTitle={updateTitle} />)

    fireEvent.change(screen.getByDisplayValue('Old'), { target: { value: 'New' } })

    expect(updateTitle).toHaveBeenCalledWith('New')
  })

  it('calls onAudioFileChange when an audio file is selected', function () {
    const onAudioFileChange = vi.fn()
    const { container } = render(<AudioCard {...emptyProps} onAudioFileChange={onAudioFileChange} />)

    const input = container.querySelector('input[name="audio-input"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    expect(onAudioFileChange).toHaveBeenCalledTimes(1)
    expect(onAudioFileChange.mock.calls[0]![0]).toEqual([file])
  })

  it('displays the audio thumbnail when a thumbnailSrc is provided', function () {
    render(
      <AudioCard {...emptyProps} src="https://example.com/track.mp3" thumbnailSrc="https://example.com/cover.png" />,
    )

    expect(screen.getByTestId('audio-thumbnail')).toHaveAttribute('src', 'https://example.com/cover.png')
  })

  it('calls onThumbnailFileChange when a thumbnail file is selected', function () {
    const onThumbnailFileChange = vi.fn()
    const { container } = render(
      <AudioCard {...emptyProps} src="https://example.com/track.mp3" onThumbnailFileChange={onThumbnailFileChange} />,
    )

    const input = container.querySelector('input[name="image-input"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    expect(onThumbnailFileChange).toHaveBeenCalledTimes(1)
  })

  it('calls removeThumbnail when the thumbnail delete button is clicked', function () {
    const removeThumbnail = vi.fn()
    render(
      <AudioCard
        {...emptyProps}
        isEditing
        src="https://example.com/track.mp3"
        thumbnailSrc="https://example.com/cover.png"
        removeThumbnail={removeThumbnail}
      />,
    )

    fireEvent.click(screen.getByLabelText('Delete'))

    expect(removeThumbnail).toHaveBeenCalledTimes(1)
  })
})
