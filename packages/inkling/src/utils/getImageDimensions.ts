// gets image dimensions from a given Url

import { awaitMediaEvents } from '@/utils/awaitMediaEvents'

export interface ImageDimensions {
  width: number
  height: number
}

export async function getImageDimensions(url: string): Promise<ImageDimensions> {
  const img = new Image()
  await awaitMediaEvents(img, {
    events: ['load'],
    errorMessage: 'Failed to load image',
    // Set image src after listeners to avoid the image loading before the listener is set
    start: () => {
      img.src = url
    },
  })
  return { width: img.naturalWidth, height: img.naturalHeight }
}
