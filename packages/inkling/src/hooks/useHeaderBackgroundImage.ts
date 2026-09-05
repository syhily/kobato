import { useEffect, useState } from 'react'

import type { HeaderNodeWriter } from '@/nodes/header/header-field-writer'

import { getAccentColor } from '@/utils/getAccentColor'

export interface UseHeaderBackgroundImageOptions {
  /** The node's current layout — the layout-change transition keys off it. */
  layout: string
  /** The node's current background image src. */
  backgroundImageSrc: string
  /** The card write seam binding for this node. */
  write: HeaderNodeWriter
  /** Opens the card's file dialog (the component owns the input ref). */
  openFileDialog: () => void
}

export interface UseHeaderBackgroundImageResult {
  showBackgroundImage: boolean
  /**
   * Show the image: restore the remembered src when there is one and the
   * user did not deliberately remove it; otherwise open the file dialog.
   */
  showImage: () => void
  /** Hide the image: clear the node src but keep the remembered src, so a later show restores it. */
  hideImage: () => void
  /**
   * Remove the image deliberately: clear the node src and mark the removal,
   * so the next show opens the file dialog instead of restoring.
   */
  clearImage: () => void
  /** Upload completion: remember the applied src and clear the deliberate-removal flag. */
  imageApplied: (src: string) => void
}

/**
 * The header card's background-image show/hide/remove policy (one named home
 * for the `showBackgroundImage`/`lastBackgroundImage`/`imageRemoved` triad
 * the component used to coordinate across effects):
 *
 * - mount/layout transition: a non-split layout re-derives visibility from
 *   the node src; switching TO `split` with no src but a remembered image
 *   re-runs the show transition (which may open the file dialog).
 * - show: restore the remembered src through the write seam, or open the
 *   file dialog when there is nothing (restorable) to restore.
 * - hide vs clear: hide keeps the remembered src; clear marks the removal
 *   deliberate, cutting the restore path.
 *
 * Also owns the mount-time accent-color backfill (getAccentColor → node), so
 * the component carries no node-write effects at all.
 */
export function useHeaderBackgroundImage({
  layout,
  backgroundImageSrc,
  write,
  openFileDialog,
}: UseHeaderBackgroundImageOptions): UseHeaderBackgroundImageResult {
  const [showBackgroundImage, setShowBackgroundImage] = useState<boolean>(Boolean(backgroundImageSrc))
  const [lastBackgroundImage, setLastBackgroundImage] = useState<string>(backgroundImageSrc)

  // this is used to determine if the image was deliberately removed by the user or not, for some UX finesse
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

  // layout transition, visibility half: a non-split layout re-derives
  // visibility from the node src, and the split-restore transition shows the
  // image — adjusted during render (React re-renders before committing)
  const [prevLayout, setPrevLayout] = useState(layout)
  if (prevLayout !== layout) {
    setPrevLayout(layout)
    if (layout !== 'split') {
      setShowBackgroundImage(Boolean(backgroundImageSrc))
    } else if (!backgroundImageSrc && lastBackgroundImage) {
      setShowBackgroundImage(true)
    }
  }

  // layout transition, side-effect half: switching TO `split` with no src but
  // a remembered image restores through the write seam (or opens the file
  // dialog when the removal was deliberate) — node writes stay in an effect
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
    // We just want to reset the show background image state when the layout changes, not when the image changes
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [layout])

  useEffect(() => {
    const accent = getAccentColor()

    if (accent) {
      write((node) => {
        node.accentColor = accent
      })
    }
  }, [write])

  return { showBackgroundImage, showImage, hideImage, clearImage, imageApplied }
}
