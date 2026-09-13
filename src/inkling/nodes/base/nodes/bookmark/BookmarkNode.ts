import type { SerializedLexicalNode } from 'lexical'

import type {
  CardSpecFieldMapFor,
  DecoratorNodeProperty,
  NestedEditorSpec,
  TransientPropSpec,
} from '@/inkling/nodes/base/card-specs'
import type { CaptionEditorDataset } from '@/inkling/types/card-node-datasets'

import { generateDecoratorNode } from '@/inkling/nodes/base/generate-decorator-node'
import { parseBookmarkNode } from '@/inkling/nodes/base/nodes/bookmark/bookmark-parser'
import { renderBookmarkNode } from '@/inkling/nodes/base/nodes/bookmark/bookmark-renderer'
import { captionEditorSpecBase } from '@/inkling/nodes/base/nodes/caption-editor-spec'

interface BookmarkMetadata {
  icon?: string
  title?: string
  description?: string
  author?: string
  publisher?: string
  thumbnail?: string
}

export interface BookmarkData {
  url?: string
  metadata?: BookmarkMetadata
  caption?: string
}

// the card's spec arrays live here, beside the class they type — see the
// videoNestedEditors note
export const bookmarkNestedEditors = [captionEditorSpecBase] as const satisfies readonly NestedEditorSpec[]

export const bookmarkTransientProps = [
  // true only for a card constructed from a bare url before its metadata was
  // fetched — the component's metadata-fetch effect keys off it. The initial
  // value reads the dataset the base constructor forwards to the generated
  // constructor.
  { name: 'createdWithUrl', initial: (dataset): boolean => !!dataset.url && !dataset.metadata },
] as const satisfies readonly TransientPropSpec[]

const BOOKMARK_METADATA_KEYS: ReadonlySet<string> = new Set([
  'icon',
  'title',
  'description',
  'author',
  'publisher',
  'thumbnail',
])

function isBookmarkMetadataKey(key: string): key is keyof BookmarkMetadata {
  return BOOKMARK_METADATA_KEYS.has(key)
}

// importJSON receives untrusted JSON: keep only the string fields the
// BookmarkMetadata shape declares instead of asserting the whole payload
function asBookmarkMetadata(value: unknown): BookmarkMetadata | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const metadata: BookmarkMetadata = {}
  for (const [key, field] of Object.entries(value)) {
    if (isBookmarkMetadataKey(key) && typeof field === 'string') {
      metadata[key] = field
    }
  }
  return metadata
}

const bookmarkProperties = [
  { name: 'title', default: '', wordCount: true },
  { name: 'description', default: '', wordCount: true },
  { name: 'url', default: '', urlType: 'url', wordCount: true },
  { name: 'caption', default: '', wordCount: true },
  { name: 'author', default: '' },
  { name: 'publisher', default: '' },
  { name: 'icon', urlPath: 'metadata.icon', default: '', urlType: 'url' },
  { name: 'thumbnail', urlPath: 'metadata.thumbnail', default: '', urlType: 'url' },
] as const satisfies readonly DecoratorNodeProperty[]

/**
 * The bookmark's serialized shape — the flat dataset fields are REMAPPED on
 * export (the metadata fields nest under `metadata`, so the serialized node
 * is not SerializedGeneratedDecoratorNode<dataset>; the generator's third
 * type parameter carries this instead).
 */
export interface SerializedBookmarkNode extends SerializedLexicalNode {
  url: string
  metadata: {
    icon: string
    title: string
    description: string
    author: string
    publisher: string
    thumbnail: string
  }
  caption: string
}

// the merged interface self-types the spec-driven fields — see the
// BaseAudioNode note. The dataset accessors and `__*` dataset fields need no
// declaration here: the generated instance type already carries them
// (DecoratorNodeValueMap / PrivateDatasetFields).
export interface BaseBookmarkNode
  // oxlint-disable-next-line typescript/no-empty-object-type -- class+interface merging: self-types the spec-driven fields
  extends CardSpecFieldMapFor<typeof bookmarkTransientProps, typeof bookmarkNestedEditors> {}
export class BaseBookmarkNode extends generateDecoratorNode<typeof bookmarkProperties, SerializedBookmarkNode>({
  nodeType: 'bookmark',
  properties: bookmarkProperties,
  defaultRenderFn: renderBookmarkNode,
}) {
  static importDOM() {
    return parseBookmarkNode(this)
  }

  /* override */
  constructor({ url, metadata, caption, captionEditor }: BookmarkData & CaptionEditorDataset = {}, key?: string) {
    // Forward the url, metadata, caption, and a passed-in caption editor so
    // the generated constructor can run the nested-editor setup/populate and
    // the transient-prop initialization (`createdWithUrl` reads url/metadata)
    // for subclasses that adopt the specs — both no-ops on this class. The
    // assignments below re-set the fields from the same values (?? '' matches
    // || '' for the string-typed dataset); the metadata remap covers the keys
    // super never received.
    super({ url, metadata, caption, captionEditor }, key)
    this.__url = url || ''
    this.__icon = metadata?.icon || ''
    this.__title = metadata?.title || ''
    this.__description = metadata?.description || ''
    this.__author = metadata?.author || ''
    this.__publisher = metadata?.publisher || ''
    this.__thumbnail = metadata?.thumbnail || ''
  }

  /* @override */
  getDataset(): Record<string, unknown> {
    const self = this.getLatest()
    // appendNestedEditorDataset adds the caption editor keys for wrapper
    // subclasses that adopt a `nestedEditors` spec; a no-op on this class
    return this.appendNestedEditorDataset({
      url: self.__url,
      metadata: {
        icon: self.__icon,
        title: self.__title,
        description: self.__description,
        author: self.__author,
        publisher: self.__publisher,
        thumbnail: self.__thumbnail,
      },
      caption: self.__caption,
    })
  }

  /* @override */
  static importJSON(serializedNode: Record<string, unknown>) {
    const { url, metadata, caption } = serializedNode
    const node = new this({
      url: typeof url === 'string' ? url : '',
      metadata: asBookmarkMetadata(metadata),
      caption: typeof caption === 'string' ? caption : '',
    })
    return node
  }

  /* @override */
  exportJSON(): SerializedBookmarkNode {
    // serializeNestedEditorHtml re-serializes the caption editor for wrapper
    // subclasses that adopt a `nestedEditors` spec; a no-op on this class
    return this.serializeNestedEditorHtml({
      type: 'bookmark',
      version: 1,
      url: this.url,
      metadata: {
        icon: this.icon,
        title: this.title,
        description: this.description,
        author: this.author,
        publisher: this.publisher,
        thumbnail: this.thumbnail,
      },
      caption: this.caption,
    })
  }

  isEmpty() {
    return !this.url
  }
}

export const $createBaseBookmarkNode = (dataset: BookmarkData = {}) => {
  return new BaseBookmarkNode(dataset)
}

export function $isBookmarkNode(node: unknown): node is BaseBookmarkNode {
  return node instanceof BaseBookmarkNode
}
