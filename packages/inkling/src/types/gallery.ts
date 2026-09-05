// Canonical gallery image shape. All fields are optional: editor-side flows add
// upload previews without `src` (upload-intent) and imported/legacy payloads may
// carry only a subset. The gallery renderer narrows to the required fields it
// needs via its own type guard (gallery-renderer.ts). `title`/`href` arrive via
// imported payloads even though setImages does not persist them.
export interface GalleryImage {
  src?: string
  fileName?: string
  row?: number
  width?: number
  height?: number
  alt?: string
  title?: string
  href?: string
  caption?: string
  previewSrc?: string
}
