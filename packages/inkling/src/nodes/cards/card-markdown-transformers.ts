import type { GalleryImage } from '@kobato/inkling-internal/types/gallery'
import type { ElementTransformer, MultilineElementTransformer } from '@lexical/markdown'
import type { Klass, LexicalNode } from 'lexical'

import { $createAudioNode, type AudioNode } from '@kobato/inkling-internal/nodes/AudioNode'
import { getNestedEditorSpecs } from '@kobato/inkling-internal/nodes/base/card-specs'
import { $createBookmarkNode, type BookmarkNode } from '@kobato/inkling-internal/nodes/BookmarkNode'
import { $createButtonNode, type ButtonNode } from '@kobato/inkling-internal/nodes/ButtonNode'
import { $createCalloutNode, type CalloutNode } from '@kobato/inkling-internal/nodes/CalloutNode'
import { type CARD_DECLARATIONS, type CardNodeType } from '@kobato/inkling-internal/nodes/cards/'
import { CARD_WRAPPER_NODES } from '@kobato/inkling-internal/nodes/cards/card-wrappers'
import { $createFileNode, type FileNode } from '@kobato/inkling-internal/nodes/FileNode'
import { $createGalleryNode, type GalleryNode } from '@kobato/inkling-internal/nodes/GalleryNode'
import { $createHtmlNode, type HtmlNode } from '@kobato/inkling-internal/nodes/HtmlNode'
import { $createImageNode, $isImageNode, ImageNode } from '@kobato/inkling-internal/nodes/ImageNode'
import { $createToggleNode, type ToggleNode } from '@kobato/inkling-internal/nodes/ToggleNode'
import { $createVideoNode, type VideoNode } from '@kobato/inkling-internal/nodes/VideoNode'

/**
 * The per-card markdown transformer vocabulary: a payload table keyed exhaustively
 * by the fence-eligible declarations' node types, projected into transformers by
 * `CARD_MARKDOWN_DECLARATIONS`. Eligibility and exemption are declaration data
 * (`CardMarkdownSpec`); this module holds only the payload vocabulary.
 *
 * The payloads cannot live in the declaration modules: Lexical requires every node
 * constructed inside an editor to match the registered class exactly, so each
 * transformer's `createNode`/`replace` must construct the wrapper class, and the
 * declarations must never import wrappers.
 */

export const IMAGE_CARD_TRANSFORMER: ElementTransformer = {
  dependencies: [ImageNode],
  export: (node) => {
    if (!$isImageNode(node)) {
      return null
    }
    return `![${node.alt || ''}](${node.src})`
  },
  regExp: /^!\[([^\]]*)\]\(([^)]+)\)$/,
  replace: (parentNode, _children, match, _isImport) => {
    const [, alt, src] = match
    const node = $createImageNode({ src, alt, caption: '' })
    parentNode.replace(node)
  },
  type: 'element',
}

export interface CardFencePayload {
  getData(node: LexicalNode): Record<string, unknown>
  createNode(data: Record<string, unknown>): LexicalNode
}
export function createCardTransformer({
  card,
  nodeClass,
  getData,
  createNode,
}: {
  card: string
  nodeClass: Klass<LexicalNode>
  getData: (node: LexicalNode) => Record<string, unknown>
  createNode: (data: Record<string, unknown>) => LexicalNode
}): MultilineElementTransformer {
  return {
    dependencies: [nodeClass],
    export: (node) => {
      if (!(node instanceof nodeClass)) {
        return null
      }
      const data = getData(node)
      return '```inkling:' + card + '\n' + JSON.stringify(data) + '\n```'
    },
    regExpEnd: /^```\s*$/,

    regExpStart: new RegExp('^```inkling:' + escapeRegExp(card) + '\\s*$'),
    replace: (rootNode, _children, _startMatch, _endMatch, linesInBetween, _isImport) => {
      const raw = linesInBetween?.join('\n') ?? ''
      const parsed: unknown = raw.trim() ? JSON.parse(raw) : {}
      if (typeof parsed !== 'object' || parsed === null) {
        throw new TypeError(
          `card markdown transformer: expected '${card}' fence body to be a JSON object, got ${describeValue(parsed)}`,
        )
      }

      const data: Record<string, unknown> = { ...parsed }
      const node = createNode(data)
      $detachNestedEditorsForRoundTrip(node)
      rootNode.append(node)
    },
    type: 'multiline-element',
  }
}

function $detachNestedEditorsForRoundTrip(node: LexicalNode): void {
  getNestedEditorSpecs(node).forEach((spec) => {
    Reflect.set(node, `__${spec.name}`, null)
  })
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function describeValue(value: unknown): string {
  return value === null ? 'null' : Array.isArray(value) ? 'an array' : typeof value
}

function str(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`card markdown transformer: expected '${field}' to be a string, got ${describeValue(value)}`)
  }
  return value
}

const GALLERY_IMAGE_STRING_FIELDS = ['src', 'fileName', 'alt', 'caption', 'href', 'previewSrc', 'title'] as const
const GALLERY_IMAGE_NUMBER_FIELDS = ['width', 'height', 'row'] as const

function galleryImageEntry(image: object, field: string, index: number): GalleryImage {
  const entry: Record<string, unknown> = { ...image }
  for (const key of GALLERY_IMAGE_STRING_FIELDS) {
    const value = entry[key]
    if (value !== undefined && typeof value !== 'string') {
      throw new TypeError(
        `card markdown transformer: expected '${field}[${index}].${key}' to be a string, got ${describeValue(value)}`,
      )
    }
  }
  for (const key of GALLERY_IMAGE_NUMBER_FIELDS) {
    const value = entry[key]
    if (value !== undefined && typeof value !== 'number') {
      throw new TypeError(
        `card markdown transformer: expected '${field}[${index}].${key}' to be a number, got ${describeValue(value)}`,
      )
    }
  }
  return entry as GalleryImage
}

function galleryImages(value: unknown, field: string): GalleryImage[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`card markdown transformer: expected '${field}' to be an array, got ${describeValue(value)}`)
  }

  return value.map((image: unknown, index) => {
    if (typeof image !== 'object' || image === null || Array.isArray(image)) {
      throw new TypeError(
        `card markdown transformer: expected '${field}[${index}]' to be an object, got ${describeValue(image)}`,
      )
    }
    return galleryImageEntry(image, field, index)
  })
}

type FenceCardNodeType = Extract<(typeof CARD_DECLARATIONS)[number], { markdown: { kind: 'fence' } }>['nodeType']

const CARD_FENCE_PAYLOADS: Record<FenceCardNodeType, CardFencePayload> = {
  audio: {
    getData: (node: AudioNode) => ({
      src: node.src,
      caption: node.title,
    }),
    createNode: (data) =>
      $createAudioNode({
        src: str(data.src, 'audio.src'),
        title: str(data.caption, 'audio.caption'),
      }),
  },
  bookmark: {
    getData: (node: BookmarkNode) => ({
      url: node.url,
      title: node.title,
      description: node.description,
    }),
    createNode: (data) =>
      $createBookmarkNode({
        url: str(data.url, 'bookmark.url'),
        metadata: {
          title: str(data.title, 'bookmark.title'),
          description: str(data.description, 'bookmark.description'),
        },
      }),
  },
  button: {
    getData: (node: ButtonNode) => ({
      buttonUrl: node.buttonUrl,
      buttonText: node.buttonText,
    }),
    createNode: (data) =>
      $createButtonNode({
        buttonUrl: str(data.buttonUrl, 'button.buttonUrl'),
        buttonText: str(data.buttonText, 'button.buttonText'),
      }),
  },
  callout: {
    getData: (node: CalloutNode) => ({
      text: node.calloutText,
      backgroundColor: node.backgroundColor,
    }),
    createNode: (data) =>
      $createCalloutNode({
        calloutText: str(data.text, 'callout.text'),
        backgroundColor: str(data.backgroundColor, 'callout.backgroundColor'),
      }),
  },
  file: {
    getData: (node: FileNode) => ({
      src: node.src,
      fileName: node.fileName,
      fileCaption: node.fileCaption,
    }),
    createNode: (data) =>
      $createFileNode({
        src: str(data.src, 'file.src'),
        fileName: str(data.fileName, 'file.fileName'),
        fileCaption: str(data.fileCaption, 'file.fileCaption'),
      }),
  },
  gallery: {
    getData: (node: GalleryNode) => ({
      images: node.images.flatMap((image) => (typeof image.src === 'string' ? [{ src: image.src }] : [])),
      caption: node.caption,
    }),
    createNode: (data) =>
      $createGalleryNode({
        images: galleryImages(data.images, 'gallery.images'),
        caption: str(data.caption, 'gallery.caption'),
      }),
  },
  html: {
    getData: (node: HtmlNode) => ({ html: node.html }),
    createNode: (data) => $createHtmlNode({ html: str(data.html, 'html.html') }),
  },
  toggle: {
    getData: (node: ToggleNode) => ({
      heading: node.heading,
      content: node.content,
    }),
    createNode: (data) =>
      $createToggleNode({
        heading: str(data.heading, 'toggle.heading'),
        content: str(data.content, 'toggle.content'),
      }),
  },
  video: {
    getData: (node: VideoNode) => ({
      src: node.src,
      caption: node.caption,
      thumbnailSrc: node.thumbnailSrc,
    }),
    createNode: (data) =>
      $createVideoNode({
        src: str(data.src, 'video.src'),
        caption: str(data.caption, 'video.caption'),
        thumbnailSrc: str(data.thumbnailSrc, 'video.thumbnailSrc'),
      }),
  },
}

export const CARD_MARKDOWN_DECLARATIONS = CARD_WRAPPER_NODES.map((card) => {
  const markdown = 'markdown' in card ? card.markdown : undefined

  const payload = (CARD_FENCE_PAYLOADS as Partial<Record<CardNodeType, CardFencePayload>>)[card.nodeType]
  if (markdown?.kind === 'fence' && payload === undefined) {
    throw new Error(
      `[card-markdown-transformers] '${card.nodeType}' is fence-eligible but has no fence payload in CARD_FENCE_PAYLOADS`,
    )
  }
  const markdownTransformer =
    markdown === undefined
      ? undefined
      : payload !== undefined
        ? createCardTransformer({ card: card.nodeType, nodeClass: card.node, ...payload })
        : card.nodeType === 'image'
          ? IMAGE_CARD_TRANSFORMER
          : undefined

  return Object.assign({}, card, { markdownTransformer })
})
