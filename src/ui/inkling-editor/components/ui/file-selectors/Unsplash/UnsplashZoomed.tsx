import type { UnsplashImagePayload } from '@/ui/inkling-editor/components/ui/file-selectors/Unsplash/types'

import UnsplashImage from '@/ui/inkling-editor/components/ui/file-selectors/Unsplash/UnsplashImage'

function UnsplashZoomed({
  payload,
  insertImage,
  selectImg,
  zoomed,
}: {
  payload?: UnsplashImagePayload
  insertImage?: (data: UnsplashImagePayload) => void
  selectImg?: (data: UnsplashImagePayload | null) => void
  zoomed?: UnsplashImagePayload
}) {
  if (!payload?.urls?.regular) {
    return null
  }

  return (
    <div
      className="flex h-full grow basis-0 justify-center"
      data-inkling-unsplash-zoomed
      onClick={() => selectImg?.(null)}
    >
      <UnsplashImage
        alt={payload.alt_description}
        height={payload.height}
        insertImage={insertImage}
        likes={payload.likes}
        links={payload.links}
        payload={payload}
        selectImg={selectImg}
        srcUrl={payload.urls.regular}
        urls={payload.urls}
        user={payload.user}
        width={payload.width}
        zoomed={zoomed}
      />
    </div>
  )
}

export default UnsplashZoomed
