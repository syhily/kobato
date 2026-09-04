// The kobato image node (plan docs/plans/inkling-editor-replacement.md, round
// R11): a subclass of the `.` entry's assembled `ImageNode` that persists the
// four kobato-owned dataset keys the stock declaration drops — `thumbhash` /
// `storagePath` / `imageId` (the image-library pass-through keys, consumed by
// the save-time `syncLibraryImageBlocks` relink) and `layout` (the PT float
// vocabulary `cardWidth` has no equivalent of). The shared React-free spec
// (`@/shared/lexical/cards/kobato-image`) owns the property list, the
// exportDOM renderer, and the import spec; the server projection builds its
// own class from it through the headless factory.
//
// Why subclass instead of re-declaring: the assembled class carries the
// caption nested editor and the upload transient props (`__initialFile`,
// `__previewSrc`, `__triggerFileDialog`) plus the `decorate()` →
// ImageNodeComponent wiring — re-declaring those from the spec would fork the
// upload flow. The four extra keys therefore ride hand-written overrides:
// constructor/getDataset (clone survives), exportJSON/importJSON
// (persistence), importSpec (paste), exportDOM (markup — delegated to a
// spec-built class because `createRenderContext` stays entry-internal).
//
// The composer registers THIS class for node type `image` (never alongside
// the stock class — Lexical keys registrations by type). Every stock image
// behaviour is either type-gated (slash menu, upload claiming — all read the
// registered-type set) or `instanceof BaseImageNode`-gated (upload intent,
// drop surgery — the subclass passes), so only the two CLASS-identity gates
// stand down: the stock INSERT_IMAGE_COMMAND/INSERT_MEDIA_COMMAND handlers
// and InklingSelectorPlugin. `@/client/editor/image-insert-override`
// re-supplies all three against this class (including the image-library
// picker, which kobato renders as its own dialog instead of inkling's
// selector overlay).

import type { LexicalEditor } from '@inkling/editor'

import { generateDecoratorNode, ImageNode } from '@inkling/editor'

import type { CardRenderOutput } from '@/shared/lexical/cards/card-html'

import {
  KOBATO_IMAGE_PROPERTIES,
  kobatoImageImportSpec,
  type KobatoImageLayout,
  normalizeKobatoImageLayout,
  renderKobatoImageNode,
} from '@/shared/lexical/cards/kobato-image'

/**
 * ExportDOM delegate: the inherited exportDOM is bound to the stock render
 * fn (the base class's factory closure), so the kobato markup comes from a
 * spec-built twin class whose prototype exportDOM we borrow — its body is
 * exactly `defaultRenderFn(this, createRenderContext(options))`, and this
 * instance genuinely carries the twelve dataset keys.
 */
const ExportDelegate = generateDecoratorNode({
  nodeType: 'image',
  properties: KOBATO_IMAGE_PROPERTIES,
  defaultRenderFn: renderKobatoImageNode,
  importSpec: kobatoImageImportSpec,
  hasEditMode: false,
})

type ExportDelegateInstance = InstanceType<typeof ExportDelegate>

export class KobatoImageNode extends ImageNode {
  __thumbhash: string
  __storagePath: string
  __imageId: string
  __layout: KobatoImageLayout

  constructor(dataset: Record<string, unknown> = {}, key?: string) {
    super(dataset, key)
    // The constructor (like the generated importJSON) assigns fields
    // directly, so a host-filled value survives deserialization and cloning —
    // the artifact-slot edit-invalidation invariant only governs SETTERS.
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

  /**
   * The generated getDataset reads only the stock property list — appending
   * the four extra keys keeps `clone` (which reconstructs from
   * `node.getDataset()`) lossless.
   */
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
   * The stock hand-written exportJSON (historical key order + the blob guard
   * + caption nested-editor re-serialization) plus the four kobato keys.
   * `layout` is always emitted; the three pass-through keys omit when empty
   * so library-less bodies stay byte-clean.
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

  /**
   * The constructor already whitelists the dataset keys it understands, so
   * importing is just construction from the serialized record (the generated
   * importJSON does the same through its property list — which would drop
   * the four extra keys).
   */
  static override importJSON(serializedNode: Record<string, unknown>): KobatoImageNode {
    return new KobatoImageNode(serializedNode)
  }

  static override importSpec = kobatoImageImportSpec

  // Property-style override: the inherited exportDOM TYPE is an intersection
  // (the generated two-argument signature × LexicalNode's one-argument one),
  // which a method shorthand cannot redeclare without collapsing to the last
  // overload. The delegate call needs one assertion per boundary: the
  // prototype method is typed on the delegate's own generated instance (this
  // instance satisfies the same twelve-key dataset structurally), and the
  // implementation arrow is widened back to the intersection.
  override exportDOM: ExportDelegateInstance['exportDOM'] = ((
    editor: LexicalEditor,
    options?: unknown,
  ): CardRenderOutput => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see the exportDOM comment above
    const delegate = ExportDelegate.prototype.exportDOM as unknown as (
      this: unknown,
      editor: LexicalEditor,
      options?: unknown,
    ) => CardRenderOutput
    return delegate.call(this, editor, options)
  }) as ExportDelegateInstance['exportDOM']
}
