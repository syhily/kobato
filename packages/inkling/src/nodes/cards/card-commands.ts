import type {
  CardSpecNestedEditorDataset,
  CardSpecTransientDataset,
} from '@kobato/inkling-internal/nodes/base/card-specs'
import type { AudioData, audioTransientProps } from '@kobato/inkling-internal/nodes/base/nodes/audio/AudioNode'
import type {
  BookmarkData,
  bookmarkNestedEditors,
  bookmarkTransientProps,
} from '@kobato/inkling-internal/nodes/base/nodes/bookmark/BookmarkNode'
import type { ButtonData } from '@kobato/inkling-internal/nodes/base/nodes/button/ButtonNode'
import type { CalloutData, calloutNestedEditors } from '@kobato/inkling-internal/nodes/base/nodes/callout/CalloutNode'
import type {
  CodeBlockData,
  codeBlockNestedEditors,
  codeBlockTransientProps,
} from '@kobato/inkling-internal/nodes/base/nodes/codeblock/CodeBlockNode'
import type { FileData, fileTransientProps } from '@kobato/inkling-internal/nodes/base/nodes/file/FileNode'
import type { GalleryData, galleryNestedEditors } from '@kobato/inkling-internal/nodes/base/nodes/gallery/GalleryNode'
import type { HeaderData, headerNestedEditors } from '@kobato/inkling-internal/nodes/base/nodes/header/HeaderNode'
import type { HtmlData } from '@kobato/inkling-internal/nodes/base/nodes/html/HtmlNode'
import type {
  ImageData,
  imageNestedEditors,
  imageTransientProps,
} from '@kobato/inkling-internal/nodes/base/nodes/image/ImageNode'
import type { MathData } from '@kobato/inkling-internal/nodes/base/nodes/math/MathNode'
import type { ToggleData, toggleNestedEditors } from '@kobato/inkling-internal/nodes/base/nodes/toggle/ToggleNode'
import type {
  VideoData,
  videoNestedEditors,
  videoTransientProps,
} from '@kobato/inkling-internal/nodes/base/nodes/video/VideoNode'
import type { CardNodeType } from '@kobato/inkling-internal/nodes/cards/'
import type { CardMenuCommand } from '@kobato/inkling-internal/nodes/cards/card-declaration'
import type { SnippetDataset } from '@kobato/inkling-internal/plugins/behaviour/snippet-insertion'
import type { AnyLexicalCommand } from 'lexical'

import { createCommand } from 'lexical'

export type AudioNodeDataset = AudioData & CardSpecTransientDataset<typeof audioTransientProps>
export const INSERT_AUDIO_COMMAND = createCommand<AudioNodeDataset>()
export type BookmarkNodeDataset = BookmarkData &
  CardSpecNestedEditorDataset<typeof bookmarkNestedEditors> &
  CardSpecTransientDataset<typeof bookmarkTransientProps> & {
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
    fileName?: string
    row?: number

    thumbhash?: string
    storagePath?: string
    imageId?: string

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

const NAMED_MENU_COMMANDS: Record<Exclude<CardMenuCommand, 'insert'>, AnyLexicalCommand> = {
  openGifSelector: OPEN_GIF_SELECTOR_COMMAND,
  openImageLibrary: OPEN_IMAGE_LIBRARY_COMMAND,
}

const hostInsertCommands = new Map<string, AnyLexicalCommand>()

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
export function resolveCardMenuCommand(command: CardMenuCommand, nodeType: string): AnyLexicalCommand {
  return command === 'insert' ? resolveCardInsertCommand(nodeType) : NAMED_MENU_COMMANDS[command]
}
