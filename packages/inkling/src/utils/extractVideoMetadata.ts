// taken from the original upstream implementation

import { awaitMediaEvents } from '@/utils/awaitMediaEvents'
import { createPreviewLease } from '@/utils/preview-lease'

export interface VideoMetadata {
  duration: number
  width: number
  height: number
  mimeType: string
  thumbnailBlob: Blob
}

export default async function extractVideoMetadata(file: File): Promise<VideoMetadata> {
  const mimeType = file.type

  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true

  // The object URL lives behind a lease so every settle path — success, load
  // error, timeout, canvas failure — revokes it exactly once.
  const lease = createPreviewLease(file)

  try {
    // loadedmetadata and canplay can arrive in one task for a local blob, so
    // both listeners attach before the load starts.
    await awaitMediaEvents(video, {
      events: ['loadedmetadata', 'canplay'],
      errorMessage: 'Failed to load video metadata',
      start: () => {
        video.src = lease.url
        // required for iPhone Safari to load the video contents for the thumbnail
        video.load()
      },
    })

    const { duration, videoWidth: width, videoHeight: height } = video

    await awaitMediaEvents(video, {
      events: ['seeked'],
      errorMessage: 'Failed to load video metadata',
      start: () => {
        video.currentTime = 0.5
      },
    })

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to get canvas context')
    }
    ctx.drawImage(video, 0, 0, width, height)

    const thumbnailBlob = await new Promise<Blob | null>((resolve) => {
      ctx.canvas.toBlob(resolve, 'image/jpeg', 0.75)
    })
    if (!thumbnailBlob) {
      throw new Error('Failed to create thumbnail blob')
    }

    return { duration, width, height, mimeType, thumbnailBlob }
  } finally {
    lease.release()
  }
}
