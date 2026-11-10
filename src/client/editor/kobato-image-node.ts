// The kobato image node: a subclass of the barrel's assembled `ImageNode` that
// persists the four kobato-owned dataset keys the stock declaration drops —
// `thumbhash` / `storagePath` / `imageId` (the image-library pass-through keys,
// consumed by the save-time `syncLibraryImageBlocks` relink) and `layout` (the
// legacy float vocabulary `cardWidth` has no equivalent of). The shared React-free spec
// (`@/shared/lexical/cards/kobato-image`) owns the property list, the exportDOM
// renderer, and the import spec; the server projection builds its own class from it.
//
// Subclassing instead of re-declaring keeps the assembled class's caption nested
// editor, its upload transient props (`__initialFile`, `__previewSrc`,
// `__triggerFileDialog`), and the `decorate()` wiring; re-declaring those from the
// spec would fork the upload flow.
//
// The composer registers THIS class for node type `image`, never alongside the
// stock class (Lexical keys registrations by type). Stock image behaviour is either
// type-gated or `instanceof BaseImageNode`-gated, so only the two CLASS-identity
// gates stand down and `image-insert-override` re-supplies them.

import type { CardRenderOutput } from '@/shared/lexical/cards/card-html'

import { createRenderContext, type ExportDOMOptions, ImageNode, type LexicalEditor } from '@/inkling'
import {
  type KobatoImageLayout,
  kobatoImageImportSpec,
  normalizeKobatoImageLayout,
  renderKobatoImageNode,
} from '@/shared/lexical/cards/kobato-image'

export class KobatoImageNode extends ImageNode {
  __thumbhash: string
  __storagePath: string
  __imageId: string
  __layout: KobatoImageLayout

  constructor(dataset: Record<string, unknown> = {}, key?: string) {
    super(dataset, key)
    // Fields are assigned directly (as the generated importJSON does), so a
    // host-filled value survives deserialization and cloning; the artifact-slot
    // edit-invalidation invariant governs setters only.
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

  /** The generated getDataset reads only the stock property list; appending the
   *  four extra keys keeps `clone` (which rebuilds from `getDataset()`) lossless. */
  override getDataset(): Record<string, unknown> {
    const dataset = super.getDataset()
    const self = this.getLatest()
    dataset.thumbhash = self.__thumbhash
    dataset.storagePath = self.__storagePath
    dataset.imageId = self.__imageId
    dataset.layout = self.__layout
    return dataset
  }

  /**
   * Adds the four kobato keys to the stock exportJSON. `layout` is always
   * emitted; the three pass-through keys omit when empty so library-less bodies
   * stay byte-clean.
   */
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

  /** The constructor whitelists every dataset key, so importing is plain
   *  construction; the generated importJSON would drop the four extra keys. */
  static override importJSON(serializedNode: Record<string, unknown>): KobatoImageNode {
    return new KobatoImageNode(serializedNode)
  }

  static override importSpec = kobatoImageImportSpec

  /** The inherited exportDOM is bound to the stock render fn by the base class's
   *  factory closure, so this calls the spec's renderer directly; `this` satisfies
   *  the renderer's dataset view structurally. */
  override exportDOM(editor: LexicalEditor, options?: ExportDOMOptions): CardRenderOutput {
    return renderKobatoImageNode(this, createRenderContext(options ?? {}))
  }
}

/** The card write seam's guard (`useCardChrome`) for the image variant. */
export function isKobatoImageNode(node: unknown): node is KobatoImageNode {
  return node instanceof KobatoImageNode
}
