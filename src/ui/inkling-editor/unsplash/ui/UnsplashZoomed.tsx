import { type FC } from 'react'

import UnsplashImage, { type UnsplashImageProps } from '@/ui/inkling-editor/unsplash/ui/UnsplashImage'
import { type Photo, type SelectImgFn } from '@/ui/inkling-editor/unsplash/UnsplashTypes'

interface UnsplashZoomedProps extends Omit<UnsplashImageProps, 'zoomed'> {
  zoomed: Photo | null
  selectImg: SelectImgFn
}

const UnsplashZoomed: FC<UnsplashZoomedProps> = ({ payload, insertImage, selectImg, zoomed }) => {
  return (
    <div
      className="flex h-full grow basis-0 justify-center"
      data-inkling-unsplash-zoomed
      onClick={() => selectImg(null)}
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
