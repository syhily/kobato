import type { HeaderNodeWriter } from '@kobato/inkling-internal/nodes/header/header-field-writer'

import { getAccentColor } from '@kobato/inkling-internal/utils/get-accent-color'
import { LexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useContext, useEffect, useState } from 'react'

export interface UseHeaderBackgroundImageOptions {
  layout: string
  backgroundImageSrc: string
  write: HeaderNodeWriter
  openFileDialog: () => void
}

export interface UseHeaderBackgroundImageResult {
  showBackgroundImage: boolean
  showImage: () => void
  hideImage: () => void

  clearImage: () => void

  imageApplied: (src: string) => void
}
export function useHeaderBackgroundImage({
  layout,
  backgroundImageSrc,
  write,
  openFileDialog,
}: UseHeaderBackgroundImageOptions): UseHeaderBackgroundImageResult {
  // null-safe composer read (isolated unit tests mount the hook without one —
  // useLexicalComposerContext would throw); the accent backfill scopes to
  // this editor's root so a second editor on the page can't supply the accent
  const composerContext = useContext(LexicalComposerContext)
  const editor = composerContext?.[0] ?? null
  const [showBackgroundImage, setShowBackgroundImage] = useState<boolean>(Boolean(backgroundImageSrc))
  const [lastBackgroundImage, setLastBackgroundImage] = useState<string>(backgroundImageSrc)
  const [imageRemoved, setImageRemoved] = useState<boolean>(false)
  const showImage = (): void => {
    setShowBackgroundImage(true)
    if (lastBackgroundImage && !imageRemoved) {
      write((node) => {
        node.backgroundImageSrc = lastBackgroundImage
      })
    } else {
      openFileDialog()
    }
  }

  const hideImage = (): void => {
    setShowBackgroundImage(false)
    write((node) => {
      node.backgroundImageSrc = ''
    })
  }

  const clearImage = (): void => {
    write((node) => {
      node.backgroundImageSrc = ''
    })
    setImageRemoved(true)
  }

  const imageApplied = (src: string): void => {
    setLastBackgroundImage(src)
    setImageRemoved(false)
  }

  const [prevLayout, setPrevLayout] = useState(layout)
  if (prevLayout !== layout) {
    setPrevLayout(layout)
    if (layout !== 'split') {
      setShowBackgroundImage(Boolean(backgroundImageSrc))
    } else if (!backgroundImageSrc && lastBackgroundImage) {
      setShowBackgroundImage(true)
    }
  }

  useEffect(() => {
    if (layout === 'split' && !backgroundImageSrc && lastBackgroundImage) {
      if (!imageRemoved) {
        write((node) => {
          node.backgroundImageSrc = lastBackgroundImage
        })
      } else {
        openFileDialog()
      }
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [layout])

  useEffect(() => {
    const accent = getAccentColor(editor?.getRootElement())

    if (accent) {
      write((node) => {
        node.accentColor = accent
      })
    }
  }, [write, editor])

  return { showBackgroundImage, showImage, hideImage, clearImage, imageApplied }
}
