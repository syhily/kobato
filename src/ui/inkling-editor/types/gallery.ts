export interface GalleryImage {
  src?: string
  fileName?: string
  row?: number
  width?: number
  height?: number
  alt?: string
  caption?: string
  previewSrc?: string
  [key: string]: unknown
}
