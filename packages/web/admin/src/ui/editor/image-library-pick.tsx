import type { AdminImageDto } from '@kobato/contracts/images'

import { type CardPickerRenderProps, registerCardPicker, useCardChrome } from '@kobato/inkling'
import { isKobatoImageNode, type KobatoImageNode } from '@kobato/inkling/host-cards'
import { toSiteOwnedImageSrc } from '@kobato/web-admin/ui/editor/image-insert-override'
import { ImageLibraryPicker } from '@kobato/web-admin/ui/editor/pickers/ImageLibraryPicker'

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
