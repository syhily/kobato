// gets image dimensions from a given Url

export interface ImageDimensions {
  width: number
  height: number
}

export async function getImageDimensions(url: string): Promise<ImageDimensions> {
  const img = new Image()
  return new Promise((resolve, reject) => {
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    // Set image src after listeners to avoid the image loading before the listener is set
    img.src = url
  })
}
