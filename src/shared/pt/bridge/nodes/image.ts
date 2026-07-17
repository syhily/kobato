import type { BridgeEnsureKey, PmBlockNode } from '@/shared/pt/bridge/types'
import type { ImageBlock } from '@/shared/pt/schema'

import { numberAttr, stringAttr } from '@/shared/pt/bridge/utils'

export function imageBlockToPmNode(block: ImageBlock): PmBlockNode {
  const layout = block.layout === 'left' || block.layout === 'right' ? block.layout : undefined
  return {
    type: 'image',
    attrs: {
      _key: block._key,
      src: block.src,
      alt: block.alt,
      caption: block.caption,
      layout,
      width: block.width,
      height: block.height,
      thumbhash: block.thumbhash,
      storagePath: block.storagePath,
      imageId: block.imageId,
    },
  }
}

export function pmImageToBlock(node: PmBlockNode, ensureKey: BridgeEnsureKey): ImageBlock {
  const layoutRaw = stringAttr(node.attrs, 'layout')
  const layout = layoutRaw === 'left' || layoutRaw === 'right' ? layoutRaw : undefined
  return {
    _type: 'image',
    _key: ensureKey(node.attrs),
    src: typeof node.attrs?.src === 'string' ? node.attrs.src : '',
    alt: stringAttr(node.attrs, 'alt'),
    caption: stringAttr(node.attrs, 'caption'),
    ...(layout !== undefined ? { layout } : {}),
    width: numberAttr(node.attrs, 'width'),
    height: numberAttr(node.attrs, 'height'),
    thumbhash: stringAttr(node.attrs, 'thumbhash'),
    storagePath: stringAttr(node.attrs, 'storagePath'),
    imageId: stringAttr(node.attrs, 'imageId'),
  }
}
