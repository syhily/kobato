import React, { useMemo, useRef, useState } from 'react'

import { InMemoryUnsplashProvider } from '@/ui/inkling-editor/unsplash/api/InMemoryUnsplashProvider'
import MasonryService from '@/ui/inkling-editor/unsplash/api/MasonryService'
import { PhotoUseCases } from '@/ui/inkling-editor/unsplash/api/PhotoUseCase'
import { UnsplashProvider } from '@/ui/inkling-editor/unsplash/api/UnsplashProvider'
import { UnsplashService } from '@/ui/inkling-editor/unsplash/api/UnsplashService'
import UnsplashGallery from '@/ui/inkling-editor/unsplash/ui/UnsplashGallery'
import UnsplashSelector from '@/ui/inkling-editor/unsplash/ui/UnsplashSelector'
import {
  type DefaultHeaderTypes,
  type InsertImagePayload,
  type Photo,
} from '@/ui/inkling-editor/unsplash/UnsplashTypes'

interface UnsplashModalProps {
  onClose: () => void
  onImageInsert: (image: InsertImagePayload) => void
  unsplashProviderConfig: DefaultHeaderTypes | null
}

export const UnsplashSearchModal: React.FC<UnsplashModalProps> = ({
  onClose,
  onImageInsert,
  unsplashProviderConfig,
}) => {
  const unsplashProvider = useMemo(() => {
    if (!unsplashProviderConfig) {
      return new InMemoryUnsplashProvider()
    }
    return new UnsplashProvider(unsplashProviderConfig)
  }, [unsplashProviderConfig])

  const photoUseCase = useMemo(() => new PhotoUseCases(unsplashProvider), [unsplashProvider])
  const masonryService = useMemo(() => new MasonryService(3), [])
  const UnsplashLib = useMemo(() => new UnsplashService(photoUseCase, masonryService), [photoUseCase, masonryService])
  const galleryRef = useRef<HTMLDivElement | null>(null)
  const [scrollPos, setScrollPos] = useState<number>(0)
  const [lastScrollPos, setLastScrollPos] = useState<number>(0)
  const [isLoading, setIsLoading] = useState<boolean>(UnsplashLib.searchIsRunning() || true)
  const initLoadRef = useRef<boolean>(false)
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [zoomedImg, setZoomedImg] = useState<Photo | null>(null)
  const [dataset, setDataset] = useState<Photo[][] | []>([])

  React.useEffect(() => {
    if (galleryRef.current && zoomedImg === null && lastScrollPos !== 0) {
      galleryRef.current.scrollTop = lastScrollPos
      setLastScrollPos(0)
    }
  }, [zoomedImg, scrollPos, lastScrollPos])

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  React.useEffect(() => {
    const ref = galleryRef.current
    if (!zoomedImg && ref) {
      const handleScroll = () => {
        setScrollPos(ref.scrollTop)
      }
      ref.addEventListener('scroll', handleScroll)
      return () => {
        ref.removeEventListener('scroll', handleScroll)
      }
    }
  }, [galleryRef, zoomedImg])

  const loadInitPhotos = React.useCallback(async () => {
    if (initLoadRef.current === false || searchTerm.length === 0) {
      setDataset([])
      UnsplashLib.clearPhotos()
      await UnsplashLib.loadNew()
      const columns = UnsplashLib.getColumns()
      setDataset(columns || [])
      if (galleryRef.current && galleryRef.current.scrollTop !== 0) {
        galleryRef.current.scrollTop = 0
      }
      setIsLoading(false)
    }
  }, [UnsplashLib, searchTerm])

  const handleSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value
    if (query.length > 2) {
      setZoomedImg(null)
      setSearchTerm(query)
    }
    if (query.length === 0) {
      setSearchTerm('')
      initLoadRef.current = false
      await loadInitPhotos()
    }
  }

  const search = React.useCallback(async () => {
    if (searchTerm) {
      setIsLoading(true)
      setDataset([])
      UnsplashLib.clearPhotos()
      await UnsplashLib.updateSearch(searchTerm)
      const columns = UnsplashLib.getColumns()
      if (columns) {
        setDataset(columns)
      }
      if (galleryRef.current && galleryRef.current.scrollTop !== 0) {
        galleryRef.current.scrollTop = 0
      }
      setIsLoading(false)
    }
  }, [searchTerm, UnsplashLib])

  React.useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (searchTerm.length > 2) {
        await search()
      } else {
        await loadInitPhotos()
      }
    }, 300)
    return () => {
      initLoadRef.current = true
      clearTimeout(timeoutId)
    }
  }, [searchTerm, search, loadInitPhotos])

  const loadMorePhotos = React.useCallback(async () => {
    setIsLoading(true)
    await UnsplashLib.loadNextPage()
    const columns = UnsplashLib.getColumns()
    setDataset(columns || [])
    setIsLoading(false)
  }, [UnsplashLib])

  React.useEffect(() => {
    const ref = galleryRef.current
    if (ref) {
      const handleScroll = async () => {
        if (zoomedImg === null && ref.scrollTop + ref.clientHeight >= ref.scrollHeight - 1000) {
          await loadMorePhotos()
        }
      }
      ref.addEventListener('scroll', handleScroll)
      return () => {
        ref.removeEventListener('scroll', handleScroll)
      }
    }
  }, [galleryRef, loadMorePhotos, zoomedImg])

  const selectImg = (payload: Photo | null) => {
    if (payload) {
      setZoomedImg(payload)
      setLastScrollPos(scrollPos)
    }

    if (payload === null) {
      setZoomedImg(null)
      if (galleryRef.current) {
        galleryRef.current.scrollTop = lastScrollPos
      }
    }
  }

  async function insertImage(image: InsertImagePayload) {
    if (image.src) {
      UnsplashLib.triggerDownload(image)
      onImageInsert(image)
    }
  }
  return (
    <UnsplashSelector closeModal={onClose} handleSearch={handleSearch}>
      <UnsplashGallery
        dataset={dataset}
        error={null}
        galleryRef={galleryRef}
        insertImage={insertImage}
        isLoading={isLoading}
        selectImg={selectImg}
        zoomed={zoomedImg}
      />
    </UnsplashSelector>
  )
}
