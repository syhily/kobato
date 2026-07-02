import { $generateHtmlFromNodes } from '@lexical/html'
import { createCommand } from 'lexical'
import pick from 'lodash/pick'

import type { GalleryImage } from '@/ui/inkling-editor/types/gallery'

import GalleryCardIcon from '@/ui/inkling-editor/assets/icons/inkling-card-type-gallery.svg?react'
import InklingCardWrapper from '@/ui/inkling-editor/components/InklingCardWrapper'
import { cleanBasicHtml } from '@/ui/inkling-editor/html/clean-basic-html'
import { GalleryNode as BaseGalleryNode } from '@/ui/inkling-editor/nodes/base'
import { GalleryNodeComponent } from '@/ui/inkling-editor/nodes/GalleryNodeComponent'
import MINIMAL_NODES from '@/ui/inkling-editor/nodes/MinimalNodes'
import { populateNestedEditor, setupNestedEditor } from '@/ui/inkling-editor/utils/nested-editors'

export const INSERT_GALLERY_COMMAND = createCommand()

export const MAX_IMAGES = 9
export const MAX_PER_ROW = 3

// ensure we don't save client-side only properties such as preview blob urls to the server
export const ALLOWED_IMAGE_PROPS = ['row', 'src', 'width', 'height', 'alt', 'caption', 'fileName']

export function recalculateImageRows(images: GalleryImage[]) {
  images.forEach((image: GalleryImage, idx: number) => {
    image.row = Math.ceil((idx + 1) / MAX_PER_ROW) - 1
  })
}

export class GalleryNode extends BaseGalleryNode {
  __captionEditor!: import('lexical').LexicalEditor | null
  __captionEditorInitialState!: import('lexical').EditorState | undefined

  static kgMenu = [
    {
      label: 'Gallery',
      desc: 'Create an image gallery',
      Icon: GalleryCardIcon,
      insertCommand: INSERT_GALLERY_COMMAND,
      insertParams: {
        triggerFileDialog: true,
      },
      matches: ['gallery'],
      priority: 5,
      shortcut: '/gallery',
    },
  ]

  // oxlint-disable-next-line typescript/no-explicit-any
  constructor(dataset: Record<string, any> = {}, key?: string) {
    super(dataset, key)

    const { caption } = dataset

    setupNestedEditor(this, '__captionEditor', { editor: dataset.captionEditor, nodes: MINIMAL_NODES })
    // populate nested editors on initial construction
    if (!dataset.captionEditor && caption) {
      populateNestedEditor(this, '__captionEditor', `${caption}`)
    }
  }

  getIcon() {
    return GalleryCardIcon
  }

  getDataset() {
    const dataset = super.getDataset()

    // client-side only data properties such as nested editors
    const self = this.getLatest()
    dataset.captionEditor = self.__captionEditor
    dataset.captionEditorInitialState = self.__captionEditorInitialState

    return dataset
  }

  exportJSON() {
    const json = super.exportJSON()

    // convert nested editor instances back into HTML because their content may not
    // be automatically updated when the nested editor changes
    if (this.__captionEditor) {
      this.__captionEditor.getEditorState().read(() => {
        const html = $generateHtmlFromNodes(this.__captionEditor!, null)
        const cleanedHtml = cleanBasicHtml(html)
        json.caption = cleanedHtml
      })
    }

    return json
  }

  decorate() {
    return (
      <InklingCardWrapper nodeKey={this.getKey()} width={'wide'}>
        <GalleryNodeComponent
          captionEditor={this.__captionEditor}
          captionEditorInitialState={this.__captionEditorInitialState}
          nodeKey={this.getKey()}
        />
      </InklingCardWrapper>
    )
  }

  // TODO: move to inkling-default-nodes?
  setImages(images: GalleryImage[]) {
    const datasetImages = images.slice(0, MAX_IMAGES).map((image) => pick(image, ALLOWED_IMAGE_PROPS))

    recalculateImageRows(datasetImages)
    this.images = datasetImages
  }

  addImages(images: GalleryImage[]) {
    const datasetImages = [...this.images, ...images]
      .slice(0, MAX_IMAGES)
      .map((image) => pick(image, ALLOWED_IMAGE_PROPS))

    recalculateImageRows(datasetImages)
    this.images = datasetImages
  }
}

// oxlint-disable-next-line typescript/no-explicit-any
export const $createGalleryNode = (dataset: Record<string, any>) => {
  return new GalleryNode(dataset)
}

export function $isGalleryNode(node: unknown) {
  return node instanceof GalleryNode
}
