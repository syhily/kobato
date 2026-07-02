import { $generateHtmlFromNodes } from '@lexical/html'
import { createCommand, type LexicalEditor, type LexicalNode, type NodeKey } from 'lexical'
import React from 'react'

import type { CardConfig } from '@/ui/inkling-editor/context/InklingComposerContext'

import GIFIcon from '@/ui/inkling-editor/assets/icons/inkling-card-type-gif.svg?react'
import ImageCardIcon from '@/ui/inkling-editor/assets/icons/inkling-card-type-image.svg?react'
import UnsplashIcon from '@/ui/inkling-editor/assets/icons/inkling-card-type-unsplash.svg?react'
import InklingCardWrapper from '@/ui/inkling-editor/components/InklingCardWrapper'
import { cleanBasicHtml } from '@/ui/inkling-editor/html/clean-basic-html'
import { ImageNode as BaseImageNode } from '@/ui/inkling-editor/nodes/base'
import { ImageNodeComponent } from '@/ui/inkling-editor/nodes/ImageNodeComponent'
import MINIMAL_NODES from '@/ui/inkling-editor/nodes/MinimalNodes'
import {
  OPEN_GIF_SELECTOR_COMMAND,
  OPEN_UNSPLASH_SELECTOR_COMMAND,
} from '@/ui/inkling-editor/plugins/InklingSelectorPlugin'
import { populateNestedEditor, setupNestedEditor } from '@/ui/inkling-editor/utils/nested-editors'

export const INSERT_IMAGE_COMMAND = createCommand()

export interface ImageNodeDataset {
  src?: string
  previewSrc?: string
  triggerFileDialog?: boolean
  initialFile?: File
  selector?: React.ComponentType<{ nodeKey: NodeKey }>
  isImageHidden?: boolean
  captionEditor?: LexicalEditor
  captionEditorInitialState?: import('lexical').EditorState
  caption?: string
  [key: string]: unknown
}

export class ImageNode extends BaseImageNode {
  // transient properties used to control node behaviour
  __triggerFileDialog = false
  __previewSrc: string | null = null
  __captionEditor!: LexicalEditor | undefined
  __captionEditorInitialState!: import('lexical').EditorState | undefined
  __initialFile: File | undefined
  __selector: React.ComponentType<{ nodeKey: NodeKey }> | undefined
  __isImageHidden: boolean | undefined

  static kgMenu = [
    {
      label: 'Image',
      desc: 'Upload, or embed with /image [url]',
      Icon: ImageCardIcon,
      insertCommand: INSERT_IMAGE_COMMAND,
      insertParams: {
        triggerFileDialog: true,
      },
      matches: ['image', 'img'],
      queryParams: ['src'],
      priority: 1,
      shortcut: '/image',
    },
    {
      section: 'Embeds',
      label: 'Unsplash',
      desc: '/unsplash [search term or url]',
      Icon: UnsplashIcon,
      insertCommand: OPEN_UNSPLASH_SELECTOR_COMMAND,
      insertParams: {
        triggerFileDialog: false,
      },
      isHidden: ({ config }: { config: CardConfig }) => !config?.unsplash,
      matches: ['unsplash', 'uns'],
      queryParams: ['src'],
      priority: 3,
      shortcut: '/unsplash',
    },
    {
      label: 'GIF',
      desc: 'Search and embed gifs',
      Icon: GIFIcon,
      insertCommand: OPEN_GIF_SELECTOR_COMMAND,
      insertParams: {
        triggerFileDialog: false,
      },
      matches: ['gif', 'giphy', 'tenor', 'klipy'],
      priority: 17,
      queryParams: ['src'],
      isHidden: ({ config }: { config: CardConfig }) => !config?.tenor && !config?.klipy,
      shortcut: '/gif',
    },
  ]

  static uploadType = 'image'

  constructor(dataset: ImageNodeDataset = {}, key?: NodeKey) {
    super(dataset, key)

    const { previewSrc, triggerFileDialog, initialFile, selector, isImageHidden } = dataset

    this.__previewSrc = previewSrc || ''
    // don't trigger the file dialog when rendering if we've already been given a url
    this.__triggerFileDialog = (!dataset.src && triggerFileDialog) || false

    // passed via INSERT_MEDIA_COMMAND on drag+drop or paste
    this.__initialFile = initialFile || undefined

    this.__selector = selector
    this.__isImageHidden = isImageHidden

    setupNestedEditor(this, '__captionEditor', { editor: dataset.captionEditor, nodes: MINIMAL_NODES })

    // populate nested editors on initial construction
    if (!dataset.captionEditor && dataset.caption) {
      populateNestedEditor(this, '__captionEditor', `${dataset.caption}`) // we serialize with no wrapper
    }
  }

  getIcon() {
    return ImageCardIcon
  }

  getDataset() {
    const dataset = super.getDataset() as ImageNodeDataset

    dataset.__previewSrc = this.__previewSrc
    dataset.__triggerFileDialog = this.__triggerFileDialog

    // client-side only data properties such as nested editors
    const self = this.getLatest()
    dataset.captionEditor = self.__captionEditor
    dataset.captionEditorInitialState = self.__captionEditorInitialState

    return dataset
  }

  get previewSrc() {
    const self = this.getLatest()
    return self.__previewSrc
  }

  set previewSrc(previewSrc: string | null) {
    const writable = this.getWritable()
    writable.__previewSrc = previewSrc
  }

  set triggerFileDialog(shouldTrigger: boolean) {
    const writable = this.getWritable()
    writable.__triggerFileDialog = shouldTrigger
  }

  createDOM() {
    return document.createElement('div')
  }

  exportJSON() {
    const json = super.exportJSON()

    // convert nested editor instances back into HTML because their content may not
    // be automatically updated when the nested editor changes
    const captionEditor = this.__captionEditor
    if (captionEditor) {
      captionEditor.getEditorState().read(() => {
        const html = $generateHtmlFromNodes(captionEditor, null)
        const cleanedHtml = cleanBasicHtml(html, { firstChildInnerContent: true })
        json.caption = cleanedHtml
      })
    }

    return json
  }

  decorate() {
    const Selector = this.__selector

    return (
      <InklingCardWrapper nodeKey={this.getKey()} width={this.cardWidth}>
        {Selector && <Selector nodeKey={this.getKey()} />}

        {!this.__isImageHidden && (
          <ImageNodeComponent
            altText={this.alt}
            captionEditor={this.__captionEditor}
            captionEditorInitialState={this.__captionEditorInitialState}
            href={this.href}
            initialFile={this.__initialFile}
            nodeKey={this.getKey()}
            previewSrc={this.previewSrc ?? undefined}
            src={this.src}
            triggerFileDialog={this.__triggerFileDialog}
          />
        )}
      </InklingCardWrapper>
    )
  }
}

export const $createImageNode = (dataset: ImageNodeDataset = {}, key?: NodeKey): ImageNode => {
  return new ImageNode(dataset, key)
}

export function $isImageNode(node: LexicalNode | null | undefined): node is ImageNode {
  return node instanceof ImageNode
}
