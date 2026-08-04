import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical'
import type { ReactNode } from 'react'

import { ImageView } from '@kobato/editor/lexical-core/nodes/views/image-view'
import { IMAGE_FIGURE_CLASS, IMAGE_LAYOUT_CLASS, IMG_DECODING, IMG_LOADING } from '@kobato/editor/lexical-html/manifest'
import { $applyNodeReplacement, DecoratorNode } from 'lexical'

// Image block node (PT `image` block → `{type: 'image', src, alt?,
// caption?, layout?, width?, height?, thumbhash?, storagePath?, imageId?,
// ptKey?}`). Serialization is the R1 contract; this round adds the DOM
// trio — `importDOM`/`exportDOM` on the manifest `figure` form
// (round-trippable via the `data-*` attributes) and `decorate` (the
// media-library / layout / caption editing view).

export type SerializedImageNode = Spread<
  SerializedLexicalNode,
  {
    type: 'image'
    src: string
    alt?: string
    caption?: string
    /** Horizontal alignment; omit or `center` for default centered figure. */
    layout?: 'left' | 'center' | 'right'
    width?: number
    height?: number
    thumbhash?: string
    storagePath?: string
    imageId?: string
    /** Originating PT block `_key` (migration reconciliation). */
    ptKey?: string
  }
>

export class ImageNode extends DecoratorNode<ReactNode> {
  static getType(): string {
    return 'image'
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(
      node.__src,
      node.__alt,
      node.__caption,
      node.__layout,
      node.__width,
      node.__height,
      node.__thumbhash,
      node.__storagePath,
      node.__imageId,
      node.__ptKey,
      node.__key,
    )
  }

  __src: string
  __alt: string | undefined
  __caption: string | undefined
  __layout: 'left' | 'center' | 'right' | undefined
  __width: number | undefined
  __height: number | undefined
  __thumbhash: string | undefined
  __storagePath: string | undefined
  __imageId: string | undefined
  __ptKey: string | undefined

  constructor(
    src: string,
    alt?: string,
    caption?: string,
    layout?: 'left' | 'center' | 'right',
    width?: number,
    height?: number,
    thumbhash?: string,
    storagePath?: string,
    imageId?: string,
    ptKey?: string,
    key?: NodeKey,
  ) {
    super(key)
    this.__src = src
    this.__alt = alt
    this.__caption = caption
    this.__layout = layout
    this.__width = width
    this.__height = height
    this.__thumbhash = thumbhash
    this.__storagePath = storagePath
    this.__imageId = imageId
    this.__ptKey = ptKey
  }

  static importJSON(serializedNode: SerializedImageNode): ImageNode {
    return new ImageNode(
      serializedNode.src,
      serializedNode.alt,
      serializedNode.caption,
      serializedNode.layout,
      serializedNode.width,
      serializedNode.height,
      serializedNode.thumbhash,
      serializedNode.storagePath,
      serializedNode.imageId,
      serializedNode.ptKey,
    )
  }

  exportJSON(): SerializedImageNode {
    return {
      type: 'image',
      version: 1,
      src: this.__src,
      ...(this.__alt !== undefined ? { alt: this.__alt } : {}),
      ...(this.__caption !== undefined ? { caption: this.__caption } : {}),
      ...(this.__layout !== undefined ? { layout: this.__layout } : {}),
      ...(this.__width !== undefined ? { width: this.__width } : {}),
      ...(this.__height !== undefined ? { height: this.__height } : {}),
      ...(this.__thumbhash !== undefined ? { thumbhash: this.__thumbhash } : {}),
      ...(this.__storagePath !== undefined ? { storagePath: this.__storagePath } : {}),
      ...(this.__imageId !== undefined ? { imageId: this.__imageId } : {}),
      ...(this.__ptKey !== undefined ? { ptKey: this.__ptKey } : {}),
    }
  }

  isInline(): boolean {
    return false
  }

  // --- mutation helpers (editor views) ---------------------------------------

  setSrc(src: string): void {
    this.getWritable().__src = src
  }

  setAlt(alt: string | undefined): void {
    this.getWritable().__alt = alt
  }

  setCaption(caption: string | undefined): void {
    this.getWritable().__caption = caption
  }

  setLayout(layout: 'left' | 'center' | 'right' | undefined): void {
    this.getWritable().__layout = layout
  }

  setWidth(width: number | undefined): void {
    this.getWritable().__width = width
  }

  setHeight(height: number | undefined): void {
    this.getWritable().__height = height
  }

  setThumbhash(thumbhash: string | undefined): void {
    this.getWritable().__thumbhash = thumbhash
  }

  setStoragePath(storagePath: string | undefined): void {
    this.getWritable().__storagePath = storagePath
  }

  setImageId(imageId: string | undefined): void {
    this.getWritable().__imageId = imageId
  }

  getSrc(): string {
    return this.__src
  }

  getAlt(): string | undefined {
    return this.__alt
  }

  getCaption(): string | undefined {
    return this.__caption
  }

  getLayout(): 'left' | 'center' | 'right' | undefined {
    return this.__layout
  }

  getWidth(): number | undefined {
    return this.__width
  }

  getHeight(): number | undefined {
    return this.__height
  }

  getThumbhash(): string | undefined {
    return this.__thumbhash
  }

  getStoragePath(): string | undefined {
    return this.__storagePath
  }

  getImageId(): string | undefined {
    return this.__imageId
  }

  getPtKey(): string | undefined {
    return this.__ptKey
  }

  // --- DOM trio ---------------------------------------------------------------
  //
  // `createDOM` returns the in-editor container (the React view is
  // portaled into it); the export form is built separately in
  // `exportDOM` with the manifest figure markup.

  createDOM(_config: EditorConfig, _editor: LexicalEditor): HTMLElement {
    return document.createElement('div')
  }

  updateDOM(_prevNode: ImageNode, _dom: HTMLElement, _config: EditorConfig): boolean {
    return false
  }

  decorate(editor: LexicalEditor): ReactNode {
    return <ImageView node={this} editor={editor} />
  }

  static importDOM(): DOMConversionMap | null {
    return {
      figure: (element: HTMLElement) => {
        if (element.getAttribute('data-pt-image') === null) {
          return null
        }
        const img = element.querySelector('img')
        const src = img?.getAttribute('src') ?? ''
        const parseDimension = (value: string | null): number | undefined => {
          if (value === null) {
            return undefined
          }
          const parsed = Number.parseInt(value, 10)
          return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
        }
        const layout = element.getAttribute('data-layout')
        const caption = element.querySelector('figcaption')?.textContent ?? undefined
        const ptKey = element.getAttribute('data-pt-key') ?? undefined
        return {
          conversion: () => ({
            node: $createImageNode(src, {
              alt: img?.getAttribute('alt') ?? undefined,
              caption,
              layout: layout === 'left' || layout === 'right' || layout === 'center' ? layout : undefined,
              width: parseDimension(img?.getAttribute('width') ?? null),
              height: parseDimension(img?.getAttribute('height') ?? null),
              thumbhash: img?.getAttribute('data-thumbhash') ?? undefined,
              storagePath: element.getAttribute('data-storage-path') ?? undefined,
              imageId: element.getAttribute('data-image-id') ?? undefined,
              ptKey,
            }),
          }),
          priority: 1,
        }
      },
    }
  }

  exportDOM(_editor: LexicalEditor): DOMExportOutput {
    // The manifest figure contract (`IMAGE_FIGURE_CLASS` + layout class,
    // `IMG_LOADING`/`IMG_DECODING`) — editor copy/paste and public render
    // stay isomorphic. Node-only fields ride along as `data-*` so the
    // round-trip through `importDOM` is lossless.
    const figure = document.createElement('figure')
    figure.setAttribute('data-pt-image', '')
    const layoutClass = this.__layout !== undefined ? IMAGE_LAYOUT_CLASS[this.__layout] : undefined
    figure.className = [IMAGE_FIGURE_CLASS, layoutClass].filter(Boolean).join(' ')
    if (this.__layout !== undefined) {
      figure.setAttribute('data-layout', this.__layout)
    }
    if (this.__storagePath !== undefined) {
      figure.setAttribute('data-storage-path', this.__storagePath)
    }
    if (this.__imageId !== undefined) {
      figure.setAttribute('data-image-id', this.__imageId)
    }
    if (this.__ptKey !== undefined) {
      figure.setAttribute('data-pt-key', this.__ptKey)
    }
    const img = document.createElement('img')
    img.src = this.__src
    img.alt = this.__alt ?? ''
    if (this.__width !== undefined) {
      img.width = this.__width
    }
    if (this.__height !== undefined) {
      img.height = this.__height
    }
    if (this.__thumbhash !== undefined) {
      img.setAttribute('data-thumbhash', this.__thumbhash)
    }
    img.loading = IMG_LOADING
    img.decoding = IMG_DECODING
    figure.append(img)
    if (this.__caption !== undefined && this.__caption !== '') {
      const figcaption = document.createElement('figcaption')
      figcaption.textContent = this.__caption
      figure.append(figcaption)
    }
    return { element: figure }
  }
}

export function $createImageNode(
  src: string,
  options?: Pick<
    SerializedImageNode,
    'alt' | 'caption' | 'layout' | 'width' | 'height' | 'thumbhash' | 'storagePath' | 'imageId' | 'ptKey'
  >,
): ImageNode {
  return $applyNodeReplacement(
    new ImageNode(
      src,
      options?.alt,
      options?.caption,
      options?.layout,
      options?.width,
      options?.height,
      options?.thumbhash,
      options?.storagePath,
      options?.imageId,
      options?.ptKey,
    ),
  )
}

export function $isImageNode(node: LexicalNode | null | undefined): node is ImageNode {
  return node instanceof ImageNode
}
