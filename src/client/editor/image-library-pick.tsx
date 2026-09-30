// The image card's library pick on the inkling pick seam (CONTEXT.md: "pick
// seam"). KobatoImageNode is a same-type VARIANT of the built-in image card
// (node type 'image'), so it cannot declare a picker through `defineCard` —
// the registration rides the variant channel (`registerCardPicker`), and the
// seam's dispatch (`CardPickerHostPlugin`) renders `ImageLibraryPicker` for
// the requesting node exactly like the music card's host-spec picker.
//
// The trigger is insert-shaped (music-card style): the 图片库 menu entry's
// command (`OPEN_IMAGE_LIBRARY_COMMAND`, intercepted at HIGH in
// `./image-insert-override`) inserts an EMPTY KobatoImageNode with the
// INSERT_CARD_COMMAND payload's `openPicker` flag, and the picker opens on
// the fresh node; the pick writes the full library dataset onto it through
// the card write seam. Dismissal leaves the empty card on the canvas as the
// stock upload placeholder (file-dialog re-entry) — the same
// dismiss-leaves-placeholder semantics the music card's placeholder carries.
// Paste/drop/file-dialog uploads never touch this picker: they flow through
// `pageEditorFileUploader` with `initialFile`/`triggerFileDialog` datasets
// and no `openPicker` flag.
//
// Registered at module top level, mirroring the defineCard idiom — the
// composer-side import (page-editor-nodes) carries the side effect.

import type { AdminImageDto } from '@/shared/contracts/images'

import { toSiteOwnedImageSrc } from '@/client/editor/image-insert-override'
import { isKobatoImageNode, type KobatoImageNode } from '@/client/editor/kobato-image-node'
import { type CardPickerRenderProps, registerCardPicker, useCardChrome } from '@/inkling'
import { ImageLibraryPicker } from '@/ui/admin/editor/pickers/ImageLibraryPicker'

/**
 * The pick → dataset mapping: the library DTO onto the node's image fields.
 * `src` stores the site-owned origin-relative form (the asset-URL policy —
 * the DTO's `publicUrl` is absolute); the library pass-through keys
 * (`thumbhash`/`storagePath`/`imageId`) feed the save-time relink.
 */
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

/**
 * The picker render registered for node type 'image': mounts the host-owned
 * `ImageLibraryPicker` against the requesting node. The pick write resolves
 * the latest node instance by key (the card write seam), so a card deleted
 * while the dialog was open no-ops instead of throwing. On the
 * insert-triggered open (`fromInsert` — the 图片库 entry inserts the empty
 * card with `openPicker: true`) the write merges into the insert's history
 * entry, so one Cmd+Z retracts insert and pick together.
 */
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
