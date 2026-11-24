import type {
  CardSpecFieldMapFor,
  CardSpecNestedEditorDataset,
  DecoratorNodeProperty,
  NestedEditorSpec,
  TransientPropSpec,
} from '@kobato/inkling-internal/nodes/base/card-specs'
import type { SerializedLexicalNode } from 'lexical'

import { generateDecoratorNode } from '@kobato/inkling-internal/nodes/base/generate-decorator-node'
import { parseBookmarkNode } from '@kobato/inkling-internal/nodes/base/nodes/bookmark/bookmark-parser'
import { renderBookmarkNode } from '@kobato/inkling-internal/nodes/base/nodes/bookmark/bookmark-renderer'
import { captionEditorSpecBase } from '@kobato/inkling-internal/nodes/base/nodes/caption-editor-spec'

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

export const bookmarkNestedEditors = [captionEditorSpecBase] as const satisfies readonly NestedEditorSpec[]

export const bookmarkTransientProps = [
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

export interface BaseBookmarkNode
  // oxlint-disable-next-line typescript/no-empty-object-type
  extends CardSpecFieldMapFor<typeof bookmarkTransientProps, typeof bookmarkNestedEditors> {}
export class BaseBookmarkNode extends generateDecoratorNode<typeof bookmarkProperties, SerializedBookmarkNode>({
  nodeType: 'bookmark',
  properties: bookmarkProperties,
  defaultRenderFn: renderBookmarkNode,
}) {
  static importDOM() {
    return parseBookmarkNode(this)
  }

  constructor(
    {
      url,
      metadata,
      caption,
      captionEditor,
    }: BookmarkData & CardSpecNestedEditorDataset<typeof bookmarkNestedEditors> = {},
    key?: string,
  ) {
    super({ url, metadata, caption, captionEditor }, key)
    this.__url = url || ''
    this.__icon = metadata?.icon || ''
    this.__title = metadata?.title || ''
    this.__description = metadata?.description || ''
    this.__author = metadata?.author || ''
    this.__publisher = metadata?.publisher || ''
    this.__thumbnail = metadata?.thumbnail || ''
  }

  getDataset(): Record<string, unknown> {
    const self = this.getLatest()
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

  static importJSON(serializedNode: Record<string, unknown>) {
    const { url, metadata, caption } = serializedNode
    const node = new this({
      url: typeof url === 'string' ? url : '',
      metadata: asBookmarkMetadata(metadata),
      caption: typeof caption === 'string' ? caption : '',
    })
    return node
  }

  exportJSON(): SerializedBookmarkNode {
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
