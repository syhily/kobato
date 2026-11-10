import type { AnyLexicalCommand } from 'lexical'

import { createCommand } from 'lexical'

import type { CardSpecNestedEditorDataset, CardSpecTransientDataset } from '@/inkling/nodes/base/card-specs'
import type { AudioData, audioTransientProps } from '@/inkling/nodes/base/nodes/audio/AudioNode'
import type {
  BookmarkData,
  bookmarkNestedEditors,
  bookmarkTransientProps,
} from '@/inkling/nodes/base/nodes/bookmark/BookmarkNode'
import type { ButtonData } from '@/inkling/nodes/base/nodes/button/ButtonNode'
import type { CalloutData, calloutNestedEditors } from '@/inkling/nodes/base/nodes/callout/CalloutNode'
import type {
  CodeBlockData,
  codeBlockNestedEditors,
  codeBlockTransientProps,
} from '@/inkling/nodes/base/nodes/codeblock/CodeBlockNode'
import type { FileData, fileTransientProps } from '@/inkling/nodes/base/nodes/file/FileNode'
import type { GalleryData, galleryNestedEditors } from '@/inkling/nodes/base/nodes/gallery/GalleryNode'
import type { HeaderData, headerNestedEditors } from '@/inkling/nodes/base/nodes/header/HeaderNode'
import type { HtmlData } from '@/inkling/nodes/base/nodes/html/HtmlNode'
import type { ImageData, imageNestedEditors, imageTransientProps } from '@/inkling/nodes/base/nodes/image/ImageNode'
import type { MathData } from '@/inkling/nodes/base/nodes/math/MathNode'
import type { ToggleData, toggleNestedEditors } from '@/inkling/nodes/base/nodes/toggle/ToggleNode'
import type { VideoData, videoNestedEditors, videoTransientProps } from '@/inkling/nodes/base/nodes/video/VideoNode'
import type { CardNodeType } from '@/inkling/nodes/cards'
import type { CardMenuCommand } from '@/inkling/nodes/cards/card-declaration'
import type { SnippetDataset } from '@/inkling/plugins/behaviour/snippet-insertion'

/**
 * The card insert commands: a derived view over the card declarations. Declarations
 * never import this module — they name commands by string (`CardMenuCommand`), and the
 * maps below key the command objects by card node type. Each payload derives from the
 * base node module's `*Data` intersected with its exported spec arrays; every import
 * here is type-only, so the runtime module graph is untouched. `INSERT_SNIPPET_COMMAND`
 * shares this home because the snippet menu entry dispatches through the same
 * type-erased insert path (`snippet-insertion` owns `SnippetDataset` and the surgery).
 */

export type AudioNodeDataset = AudioData & CardSpecTransientDataset<typeof audioTransientProps>
export const INSERT_AUDIO_COMMAND = createCommand<AudioNodeDataset>()

export type BookmarkNodeDataset = BookmarkData &
  CardSpecNestedEditorDataset<typeof bookmarkNestedEditors> &
  CardSpecTransientDataset<typeof bookmarkTransientProps> & {
    // AtLinkPlugin passes a top-level `title` alongside `url`; the base constructor
    // only reads `metadata.title`, so this is a tolerated no-op field.
    title?: string
  }
export const INSERT_BOOKMARK_COMMAND = createCommand<BookmarkNodeDataset>()

export type ButtonNodeDataset = ButtonData
export const INSERT_BUTTON_COMMAND = createCommand<ButtonNodeDataset>('INSERT_BUTTON_COMMAND')

export type CalloutNodeDataset = CalloutData & CardSpecNestedEditorDataset<typeof calloutNestedEditors>
export const INSERT_CALLOUT_COMMAND = createCommand<CalloutNodeDataset>()

export type CodeBlockNodeDataset = CodeBlockData &
  CardSpecNestedEditorDataset<typeof codeBlockNestedEditors> &
  CardSpecTransientDataset<typeof codeBlockTransientProps>
export const INSERT_CODE_BLOCK_COMMAND = createCommand<CodeBlockNodeDataset>()

export type FileNodeDataset = FileData & CardSpecTransientDataset<typeof fileTransientProps>
export const INSERT_FILE_COMMAND = createCommand<FileNodeDataset>()

export type GalleryNodeDataset = GalleryData & CardSpecNestedEditorDataset<typeof galleryNestedEditors>
export const INSERT_GALLERY_COMMAND = createCommand<GalleryNodeDataset>()

export type HeaderNodeDataset = HeaderData & CardSpecNestedEditorDataset<typeof headerNestedEditors>
export const INSERT_HEADER_COMMAND = createCommand<HeaderNodeDataset>()

export const INSERT_HORIZONTAL_RULE_COMMAND = createCommand<undefined>()

export type HtmlNodeDataset = HtmlData
export const INSERT_HTML_COMMAND = createCommand<HtmlNodeDataset>()

export type ImageNodeDataset = ImageData &
  CardSpecNestedEditorDataset<typeof imageNestedEditors> &
  CardSpecTransientDataset<typeof imageTransientProps> & {
    // Drag-and-drop payload extras outside the property vocabulary: gallery drags
    // carry the GalleryImage keys (`useGalleryReorder`), and the image→gallery
    // merge (`@/inkling/plugins/behaviour/drop-surgery`) reads fileName back.
    fileName?: string
    row?: number
    // Image-library picks map host-schema pass-through keys onto the insert
    // dataset (`@/inkling/components/ui/LibraryPlugin`); the stock declaration
    // ignores them, a host card's own properties persist them.
    thumbhash?: string
    storagePath?: string
    imageId?: string
    // A dragged image CARD's payload is its getDataset(), which re-exposes the
    // datasetKey'd transient fields, so they ride the drag payload too.
    __previewSrc?: string | null
    __triggerFileDialog?: boolean
  }
export const INSERT_IMAGE_COMMAND = createCommand<ImageNodeDataset>()

export type MathNodeDataset = MathData
export const INSERT_MATH_COMMAND = createCommand<MathNodeDataset>()

export const INSERT_SNIPPET_COMMAND = createCommand<SnippetDataset>('INSERT_SNIPPET_COMMAND')

export type ToggleNodeDataset = ToggleData & CardSpecNestedEditorDataset<typeof toggleNestedEditors>
export const INSERT_TOGGLE_COMMAND = createCommand<ToggleNodeDataset>('INSERT_TOGGLE_COMMAND')

export type VideoNodeDataset = VideoData &
  CardSpecNestedEditorDataset<typeof videoNestedEditors> &
  CardSpecTransientDataset<typeof videoTransientProps>
export const INSERT_VIDEO_COMMAND = createCommand<VideoNodeDataset>()

export const OPEN_GIF_SELECTOR_COMMAND = createCommand<ImageNodeDataset>()
export const OPEN_IMAGE_LIBRARY_COMMAND = createCommand<ImageNodeDataset>()

/**
 * The per-card insert commands keyed by card node type: the table the declarations'
 * `'insert'` menu command and insert specs resolve through. Exhaustive over every
 * card node type but `footnotedefinition` (the footnote behaviour module creates
 * and orders definitions), so a declaration added without its command fails
 * typecheck. Host cards are absent: their insert command is created on demand by
 * `resolveCardInsertCommand`.
 */
const BUILTIN_INSERT_COMMANDS = {
  audio: INSERT_AUDIO_COMMAND,
  bookmark: INSERT_BOOKMARK_COMMAND,
  button: INSERT_BUTTON_COMMAND,
  callout: INSERT_CALLOUT_COMMAND,
  codeblock: INSERT_CODE_BLOCK_COMMAND,
  file: INSERT_FILE_COMMAND,
  gallery: INSERT_GALLERY_COMMAND,
  header: INSERT_HEADER_COMMAND,
  horizontalrule: INSERT_HORIZONTAL_RULE_COMMAND,
  html: INSERT_HTML_COMMAND,
  image: INSERT_IMAGE_COMMAND,
  math: INSERT_MATH_COMMAND,
  toggle: INSERT_TOGGLE_COMMAND,
  video: INSERT_VIDEO_COMMAND,
} satisfies Record<Exclude<CardNodeType, 'footnotedefinition'>, AnyLexicalCommand>

/**
 * The named non-insert menu commands (`CardMenuCommand` minus `'insert'`): the
 * Image card's two selector entries. Exhaustive over the name union, so a new named
 * extra fails typecheck until its command joins.
 */
const NAMED_MENU_COMMANDS: Record<Exclude<CardMenuCommand, 'insert'>, AnyLexicalCommand> = {
  openGifSelector: OPEN_GIF_SELECTOR_COMMAND,
  openImageLibrary: OPEN_IMAGE_LIBRARY_COMMAND,
}

// Host card insert commands, created on demand and memoized — Lexical's
// `createCommand` global idiom — so menu dispatch and command registration name
// the same object for host cards registered after module init.
const hostInsertCommands = new Map<string, AnyLexicalCommand>()

/**
 * Resolves a card's insert command by node type: built-ins answer from the
 * exhaustive table; an unknown (host) node type gets one command created and
 * memoized on first resolution. Both the menu projection and the insert registrar
 * resolve through this function, so dispatch and registration name one object.
 */
export function resolveCardInsertCommand(nodeType: string): AnyLexicalCommand {
  const builtin = (BUILTIN_INSERT_COMMANDS as Partial<Record<string, AnyLexicalCommand>>)[nodeType]
  if (builtin !== undefined) {
    return builtin
  }
  let command = hostInsertCommands.get(nodeType)
  if (command === undefined) {
    command = createCommand()
    hostInsertCommands.set(nodeType, command)
  }
  return command
}

/**
 * Resolves a menu entry's named command to the command object: `'insert'` names the
 * entry's own card insert command; the extras name the Image card's selector commands.
 */
export function resolveCardMenuCommand(command: CardMenuCommand, nodeType: string): AnyLexicalCommand {
  return command === 'insert' ? resolveCardInsertCommand(nodeType) : NAMED_MENU_COMMANDS[command]
}
