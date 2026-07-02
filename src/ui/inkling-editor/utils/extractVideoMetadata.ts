// taken from the original upstream implementation
export interface VideoMetadata {
  duration: number
  width: number
  height: number
  mimeType: string
  thumbnailBlob: Blob
}

export default function extractVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const mimeType = file.type
    let duration = 0
    let width = 0
    let height = 0

    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true

    video.onerror = () => reject(new Error('Failed to load video metadata'))

    video.onloadedmetadata = function () {
      duration = video.duration
      width = video.videoWidth
      height = video.videoHeight
    }

    video.oncanplay = function () {
      video.currentTime = 0.5
      video.oncanplay = null
    }

    video.onseeked = function () {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Failed to get canvas context'))
        return
      }
      ctx.drawImage(video, 0, 0, width, height)

      URL.revokeObjectURL(video.src)

      ctx.canvas.toBlob(
        (thumbnailBlob) => {
          if (!thumbnailBlob) {
            reject(new Error('Failed to create thumbnail blob'))
            return
          }
          resolve({
            duration,
            width,
            height,
            mimeType,
            thumbnailBlob,
          })
        },
        'image/jpeg',
        0.75,
      )
    }

    video.src = URL.createObjectURL(file)
    // required for iPhone Safari to load the video contents for the thumbnail
    video.load()
  })
}
