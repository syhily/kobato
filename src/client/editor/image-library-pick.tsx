// The image card's library pick on the inkling pick seam. KobatoImageNode is a
// same-type VARIANT of the built-in image card, so it cannot declare a picker
// through `defineCard`: the registration rides the variant channel
// (`registerCardPicker`) and the seam's dispatch renders `ImageLibraryPicker` for
// the requesting node.
//
// The trigger is insert-shaped: the image-library entry's OPEN_IMAGE_LIBRARY_COMMAND
// (intercepted at HIGH in `./image-insert-override`) inserts an EMPTY
// KobatoImageNode with `openPicker: true`, and the picker opens on the fresh
// node. Dismissal leaves the empty card on the canvas as the stock upload
// placeholder. Paste/drop/file-dialog uploads never touch this picker; they flow
// through `pageEditorFileUploader` with no `openPicker` flag.
//
// Registered at module top level, mirroring the defineCard idiom — the
// composer-side import (page-editor-nodes) carries the side effect.

import type { AdminImageDto } from '@/shared/contracts/images'

import { toSiteOwnedImageSrc } from '@/client/editor/image-insert-override'
import { isKobatoImageNode, type KobatoImageNode } from '@/client/editor/kobato-image-node'
import { type CardPickerRenderProps, registerCardPicker, useCardChrome } from '@/inkling'
import { ImageLibraryPicker } from '@/ui/admin/editor/pickers/ImageLibraryPicker'

/** Maps the library DTO onto the node's image fields. `src` stores the site-owned
 * origin-relative form (the DTO's `publicUrl` is absolute); `thumbhash`/
 * `storagePath`/`imageId` feed the save-time relink. */
export function imageLibraryPickDataset(image: AdminImageDto): {
  src: string
  alt: string
  width: number
  height: number
  thumbhash: string
  storagePath: string
  imageId: string
} {
  return {
    src: toSiteOwnedImageSrc(image.publicUrl),
    alt: image.note ?? '',
    width: image.width,
    height: image.height,
    thumbhash: image.thumbhash ?? '',
    storagePath: image.storagePath,
    imageId: image.id,
  }
}

/** Registered for node type 'image': mounts the host-owned `ImageLibraryPicker`
 * against the requesting node. The write resolves the latest node instance by key,
 * so a card deleted while the dialog was open no-ops instead of throwing. On an
 * insert-triggered open the write merges into the insert's history entry, so one
 * Cmd+Z retracts insert and pick together. */
export function ImageLibraryCardPicker({ nodeKey, close, fromInsert }: CardPickerRenderProps) {
  const { write } = useCardChrome(nodeKey, isKobatoImageNode)
  return (
    <ImageLibraryPicker
      open
      onOpenChange={(open) => {
        if (!open) {
          close()
        }
      }}
      onPick={(image) => {
        const dataset = imageLibraryPickDataset(image)
        write(
          (node: KobatoImageNode) => {
            node.src = dataset.src
            node.alt = dataset.alt
            node.width = dataset.width
            node.height = dataset.height
            node.thumbhash = dataset.thumbhash
            node.storagePath = dataset.storagePath
            node.imageId = dataset.imageId
          },
          { mergeHistory: fromInsert === true },
        )
        close()
      }}
    />
  )
}

registerCardPicker('image', {
  render: (props) => <ImageLibraryCardPicker {...props} />,
})
