import type { CardRenderOutput } from '@kobato/inkling-internal/headless/cards/card-html'
import type { ExportDOMOptions } from '@kobato/inkling-internal/nodes/base/export-dom'
import type { LexicalEditor } from 'lexical'

import {
  type KobatoImageLayout,
  kobatoImageImportSpec,
  normalizeKobatoImageLayout,
  renderKobatoImageNode,
} from '@kobato/inkling-internal/headless/cards/kobato-image'
import { createRenderContext } from '@kobato/inkling-internal/nodes/base/render-context'
import { ImageNode } from '@kobato/inkling-internal/nodes/ImageNode'

export class KobatoImageNode extends ImageNode {
  __thumbhash: string
  __storagePath: string
  __imageId: string
  __layout: KobatoImageLayout

  constructor(dataset: Record<string, unknown> = {}, key?: string) {
    super(dataset, key)
    this.__thumbhash = typeof dataset.thumbhash === 'string' ? dataset.thumbhash : ''
    this.__storagePath = typeof dataset.storagePath === 'string' ? dataset.storagePath : ''
    this.__imageId = typeof dataset.imageId === 'string' ? dataset.imageId : ''
    this.__layout = normalizeKobatoImageLayout(dataset.layout)
  }

  get thumbhash(): string {
    return this.getLatest().__thumbhash
  }
  set thumbhash(value: string) {
    this.getWritable().__thumbhash = value
  }

  get storagePath(): string {
    return this.getLatest().__storagePath
  }
  set storagePath(value: string) {
    this.getWritable().__storagePath = value
  }

  get imageId(): string {
    return this.getLatest().__imageId
  }
  set imageId(value: string) {
    this.getWritable().__imageId = value
  }

  get layout(): KobatoImageLayout {
    return this.getLatest().__layout
  }
  set layout(value: KobatoImageLayout) {
    this.getWritable().__layout = normalizeKobatoImageLayout(value)
  }

  override getDataset(): Record<string, unknown> {
    const dataset = super.getDataset()
    const self = this.getLatest()
    dataset.thumbhash = self.__thumbhash
    dataset.storagePath = self.__storagePath
    dataset.imageId = self.__imageId
    dataset.layout = self.__layout
    return dataset
  }

  override exportJSON() {
    const json = super.exportJSON()
    const extra: Record<string, unknown> = { layout: this.layout }
    if (this.thumbhash !== '') {
      extra.thumbhash = this.thumbhash
    }
    if (this.storagePath !== '') {
      extra.storagePath = this.storagePath
    }
    if (this.imageId !== '') {
      extra.imageId = this.imageId
    }
    return { ...json, ...extra }
  }

  static override importJSON(serializedNode: Record<string, unknown>): KobatoImageNode {
    return new KobatoImageNode(serializedNode)
  }

  static override importSpec = kobatoImageImportSpec

  override exportDOM(editor: LexicalEditor, options?: ExportDOMOptions): CardRenderOutput {
    return renderKobatoImageNode(this, createRenderContext(options ?? {}))
  }
}

export function isKobatoImageNode(node: unknown): node is KobatoImageNode {
  return node instanceof KobatoImageNode
}
