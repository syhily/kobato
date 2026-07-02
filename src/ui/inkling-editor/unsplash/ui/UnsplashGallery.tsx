import React, { type ReactNode, type RefObject } from 'react'

import UnsplashImage from '@/ui/inkling-editor/unsplash/ui/UnsplashImage'
import UnsplashZoomed from '@/ui/inkling-editor/unsplash/ui/UnsplashZoomed'
import { type InsertImageFn, type Photo, type SelectImgFn } from '@/ui/inkling-editor/unsplash/UnsplashTypes'

interface MasonryColumnProps {
  children: ReactNode
}

interface UnsplashGalleryColumnsProps {
  columns?: Photo[][] | []
  insertImage: InsertImageFn
  selectImg: SelectImgFn
  zoomed?: Photo | null
}

interface GalleryLayoutProps {
  children?: ReactNode
  // yufan.me: React 19 types — useRef<T>(null) now yields RefObject<T | null>.
  galleryRef: RefObject<HTMLDivElement | null>
  isLoading?: boolean
  zoomed?: Photo | null
}

interface UnsplashGalleryProps extends GalleryLayoutProps {
  error?: string | null
  dataset?: Photo[][] | []
  selectImg: SelectImgFn
  insertImage: InsertImageFn
}

const UnsplashGalleryLoading: React.FC = () => {
  return (
    <div
      className="absolute inset-y-0 left-0 flex w-full items-center justify-center overflow-hidden pb-[8vh]"
      data-inkling-loader
    >
      <div className="relative inline-block size-[50px] animate-spin rounded-full border border-black/10 before:z-10 before:mt-[7px] before:block before:size-[7px] before:rounded-full before:bg-grey-800"></div>
    </div>
  )
}

export const MasonryColumn: React.FC<MasonryColumnProps> = (props) => {
  return <div className="mr-6 flex grow basis-0 flex-col justify-start last-of-type:mr-0">{props.children}</div>
}

const UnsplashGalleryColumns: React.FC<UnsplashGalleryColumnsProps> = (props) => {
  if (!props?.columns) {
    return null
  }

  return props?.columns.map((array, index) => (
    <MasonryColumn key={array[0]?.id ?? `empty-${index}`}>
      {array.map((payload: Photo) => (
        <UnsplashImage
          key={payload.id}
          alt={payload.alt_description}
          height={payload.height}
          insertImage={props?.insertImage}
          likes={payload.likes}
          links={payload.links}
          payload={payload}
          selectImg={props?.selectImg}
          srcUrl={payload.urls.regular}
          urls={payload.urls}
          user={payload.user}
          width={payload.width}
          zoomed={props?.zoomed || null}
        />
      ))}
    </MasonryColumn>
  ))
}

const GalleryLayout: React.FC<GalleryLayoutProps> = (props) => {
  return (
    <div className="relative h-full overflow-hidden" data-inkling-unsplash-gallery>
      <div
        ref={props.galleryRef}
        className={`flex size-full justify-center overflow-auto px-20 ${props?.zoomed ? 'pb-10' : ''}`}
        data-inkling-unsplash-gallery-scrollref
      >
        {props.children}
        {props?.isLoading && <UnsplashGalleryLoading />}
      </div>
    </div>
  )
}

const UnsplashGallery: React.FC<UnsplashGalleryProps> = ({
  zoomed,
  error,
  galleryRef,
  isLoading,
  dataset,
  selectImg,
  insertImage,
}) => {
  if (zoomed) {
    return (
      <GalleryLayout galleryRef={galleryRef} zoomed={zoomed}>
        <UnsplashZoomed
          alt={zoomed.alt_description}
          height={zoomed.height}
          insertImage={insertImage}
          likes={zoomed.likes}
          links={zoomed.links}
          payload={zoomed}
          selectImg={selectImg}
          srcUrl={zoomed.urls.regular}
          urls={zoomed.urls}
          user={zoomed.user}
          width={zoomed.width}
          zoomed={zoomed}
        />
      </GalleryLayout>
    )
  }

  if (error) {
    return (
      <GalleryLayout galleryRef={galleryRef} zoomed={zoomed}>
        <div className="flex h-full flex-col items-center justify-center">
          <h1 className="mb-4 text-2xl font-bold">Error</h1>
          <p className="text-lg font-medium">{error}</p>
        </div>
      </GalleryLayout>
    )
  }

  return (
    <GalleryLayout galleryRef={galleryRef} isLoading={isLoading} zoomed={zoomed}>
      <UnsplashGalleryColumns columns={dataset} insertImage={insertImage} selectImg={selectImg} zoomed={zoomed} />
    </GalleryLayout>
  )
}

export default UnsplashGallery
