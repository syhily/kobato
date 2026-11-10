import { awaitMediaEvents } from '@/inkling/utils/awaitMediaEvents'

export interface ImageDimensions {
  width: number
  height: number
}

export async function getImageDimensions(url: string): Promise<ImageDimensions> {
  const img = new Image()
  await awaitMediaEvents(img, {
    events: ['load'],
    errorMessage: 'Failed to load image',
    start: () => {
      img.src = url
    },
  })
  return { width: img.naturalWidth, height: img.naturalHeight }
}
